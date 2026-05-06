import type { Database } from 'sql.js';
import type { Note, Location } from './types';
import { bibleBookName, isBibleKeySymbol } from './bible';
import { issueShort, pubLabel } from './publications';

export interface NoteRef {
	kind: 'bible' | 'publication' | 'unknown';
	display: string;       // human reference, e.g. "Salmo 37:8-10" or "w26.01 par. 12"
	short: string;         // compact form, e.g. "Salmo 37.8-10" — for filenames
	source: string;        // publication label, e.g. "A Sentinela (Estudo)"
	keySymbol: string;     // raw KeySymbol
	bookNumber?: number;
	chapter?: number;
	verses?: number[];
	verseRangeText?: string;
	paragraph?: number;
	paragraphRangeText?: string;
	documentId?: number;
	issue?: number;
	year?: number;
	month?: number;
}

interface LocRow {
	LocationId: number;
	BookNumber: number | null;
	ChapterNumber: number | null;
	DocumentId: number | null;
	Track: number | null;
	IssueTagNumber: number;
	KeySymbol: string | null;
	MepsLanguage: number | null;
	Type: number;
	Title: string | null;
}

function getLocation(db: Database, id: number): LocRow | null {
	const stmt = db.prepare('SELECT * FROM Location WHERE LocationId = ?');
	stmt.bind([id]);
	const row = stmt.step() ? (stmt.getAsObject() as unknown as LocRow) : null;
	stmt.free();
	return row;
}

/**
 * Returns BlockRange identifiers for a UserMark, filtered by BlockType.
 * BlockType=2 → Bible verses; BlockType=1 → publication paragraphs.
 * Each UserMark may contain rows of *both* types (the JW Library renderer
 * tracks paragraph offsets even on Bible chapters), so filtering is required
 * to avoid pulling internal paragraph IDs (e.g. 1763) into a verse list.
 */
function getBlockRangeIdentifiers(db: Database, userMarkId: number, blockType: number): number[] {
	const stmt = db.prepare(
		'SELECT DISTINCT Identifier FROM BlockRange WHERE UserMarkId = ? AND BlockType = ? ORDER BY Identifier'
	);
	stmt.bind([userMarkId, blockType]);
	const out: number[] = [];
	while (stmt.step()) out.push((stmt.getAsObject().Identifier as number) ?? 0);
	stmt.free();
	return out;
}

/**
 * Collapse a sorted, deduplicated list of integers into compact range text.
 * [3,4,5] → "3-5", [4,5] → "4-5", [3,5,6,9] → "3,5-6,9", [1,2,4,5,7] → "1-2,4-5,7"
 * Adjacent runs of length ≥2 collapse to "a-b"; isolates stay as "a".
 * Aligned with AMOSTRA (Isaías 56.4-5).
 */
export function collapseRanges(nums: number[], sep = ','): string {
	if (nums.length === 0) return '';
	const sorted = [...new Set(nums)].sort((a, b) => a - b);
	const parts: string[] = [];
	let i = 0;
	while (i < sorted.length) {
		let j = i;
		while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
		const runLen = j - i + 1;
		if (runLen >= 2) parts.push(`${sorted[i]}-${sorted[j]}`);
		else for (let k = i; k <= j; k++) parts.push(String(sorted[k]));
		i = j + 1;
	}
	return parts.join(sep);
}

/**
 * Resolve a Note → reference object.
 * Verse range comes from BlockRange (when UserMarkId set), otherwise from Note.BlockIdentifier.
 */
export function resolveRef(db: Database, note: Note): NoteRef {
	const empty: NoteRef = {
		kind: 'unknown',
		display: '(sem referência)',
		short: 'sem-referencia',
		source: '',
		keySymbol: ''
	};
	if (note.LocationId == null) return empty;

	const loc = getLocation(db, note.LocationId);
	if (!loc) return empty;

	const ks = loc.KeySymbol ?? '';
	const isBible = isBibleKeySymbol(ks) && !!loc.BookNumber && !!loc.ChapterNumber;
	const targetBlockType = isBible ? 2 : 1;

	let identifiers: number[] = [];
	if (note.UserMarkId != null) {
		identifiers = getBlockRangeIdentifiers(db, note.UserMarkId, targetBlockType);
	}
	if (identifiers.length === 0 && note.BlockIdentifier != null) identifiers = [note.BlockIdentifier];

	if (isBible) {
		const book = bibleBookName(loc.BookNumber);
		const verseText = collapseRanges(identifiers, ',');
		const display = verseText
			? `${book} ${loc.ChapterNumber}:${verseText}`
			: `${book} ${loc.ChapterNumber}`;
		const short = verseText
			? `${book} ${loc.ChapterNumber}.${verseText}`
			: `${book} ${loc.ChapterNumber}`;
		return {
			kind: 'bible',
			display,
			short,
			source: 'Bíblia',
			keySymbol: ks,
			bookNumber: loc.BookNumber ?? undefined,
			chapter: loc.ChapterNumber ?? undefined,
			verses: identifiers,
			verseRangeText: verseText
		};
	}

	// Publication
	const issue = loc.IssueTagNumber || 0;
	const issueStr = issueShort(issue);
	const yearMonth = issueStr ? `.${issueStr}` : '';
	const docPart = loc.DocumentId ? ` doc ${loc.DocumentId}` : '';
	const paraText = collapseRanges(identifiers, ',');
	const paraSuffix = paraText
		? ` par. ${paraText}`
		: note.BlockIdentifier != null
			? ` par. ${note.BlockIdentifier}`
			: '';
	const display = `${ks}${yearMonth}${docPart}${paraSuffix}`.trim();
	const short = display.replace(/\s+/g, ' ');

	let year: number | undefined;
	let month: number | undefined;
	if (issueStr) {
		const s = String(issue);
		year = parseInt(s.slice(0, 4), 10);
		month = parseInt(s.slice(4, 6), 10);
	}

	return {
		kind: ks ? 'publication' : 'unknown',
		display: display || '(sem referência)',
		short: short || 'sem-referencia',
		source: pubLabel(ks),
		keySymbol: ks,
		documentId: loc.DocumentId ?? undefined,
		issue: issue || undefined,
		year,
		month,
		paragraph: note.BlockIdentifier ?? undefined,
		paragraphRangeText: paraText || undefined
	};
}

export function getNoteTags(db: Database, noteId: number): string[] {
	const stmt = db.prepare(
		'SELECT t.Name FROM TagMap tm JOIN Tag t ON t.TagId = tm.TagId WHERE tm.NoteId = ? ORDER BY tm.Position'
	);
	stmt.bind([noteId]);
	const out: string[] = [];
	while (stmt.step()) out.push(stmt.getAsObject().Name as string);
	stmt.free();
	return out;
}

export function getColorIndex(db: Database, userMarkId: number | null): number | null {
	if (userMarkId == null) return null;
	const stmt = db.prepare('SELECT ColorIndex FROM UserMark WHERE UserMarkId = ?');
	stmt.bind([userMarkId]);
	const v = stmt.step() ? (stmt.getAsObject().ColorIndex as number) : null;
	stmt.free();
	return v;
}
