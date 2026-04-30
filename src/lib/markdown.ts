import { zipSync, strToU8 } from 'fflate';
import type { Database } from 'sql.js';
import type { Note } from './types';
import { listNotes } from './queries';
import { resolveRef, getNoteTags, getColorIndex, type NoteRef } from './refs';

export interface ExportOptions {
	folderByYear?: boolean;     // group files by year
	includeFrontmatter?: boolean;
	includeBacklink?: boolean;  // Obsidian wikilink to ref note
	dateFormat?: 'iso' | 'br';
}

const DEFAULT_OPTS: Required<ExportOptions> = {
	folderByYear: false,
	includeFrontmatter: true,
	includeBacklink: true,
	dateFormat: 'iso'
};

const HIGHLIGHT_COLORS = [
	'sem cor',
	'amarelo',
	'verde',
	'azul',
	'roxo',
	'rosa',
	'laranja'
];

/** YAML-safe scalar quote. */
function yamlString(s: string): string {
	if (/^[\w\s\-./:,()'"]+$/.test(s) && !s.includes('\n') && !s.startsWith(' ') && !s.endsWith(' ')) {
		return s;
	}
	return JSON.stringify(s);
}

function fmtDate(iso: string, format: 'iso' | 'br'): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return iso;
	if (format === 'br') {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
	}
	return d.toISOString();
}

/** Sanitize for filesystem: drop reserved chars on Win/Mac, collapse spaces. */
export function safeFilename(name: string, maxLen = 120): string {
	let out = name
		.replace(/[\\/:*?"<>|]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (out.length > maxLen) out = out.slice(0, maxLen).trim();
	return out || 'sem-titulo';
}

export function noteToMarkdown(
	db: Database,
	note: Note,
	opts: ExportOptions = {}
): { filename: string; folder: string; content: string; ref: NoteRef } {
	const o = { ...DEFAULT_OPTS, ...opts };
	const ref = resolveRef(db, note);
	const tags = getNoteTags(db, note.NoteId);
	const color = getColorIndex(db, note.UserMarkId);
	const colorName = color != null ? HIGHLIGHT_COLORS[color] ?? `cor ${color}` : null;

	const titleLine = note.Title?.trim() || ref.display || '(sem título)';
	const baseName = safeFilename(`${ref.short} — ${titleLine}`);
	const filename = `${baseName}.md`;

	const year = note.Created?.slice(0, 4) || 'sem-data';
	const folder = o.folderByYear ? `Notas/${year}` : 'Notas';

	const created = fmtDate(note.Created, o.dateFormat);
	const modified = fmtDate(note.LastModified, o.dateFormat);

	const lines: string[] = [];
	if (o.includeFrontmatter) {
		lines.push('---');
		lines.push(`title: ${yamlString(titleLine)}`);
		lines.push(`ref: ${yamlString(ref.display)}`);
		lines.push(`source: ${yamlString(ref.source || ref.keySymbol)}`);
		if (ref.kind === 'bible') {
			lines.push(`book: ${yamlString(String(ref.bookNumber ?? ''))}`);
			lines.push(`chapter: ${ref.chapter ?? ''}`);
			if (ref.verseRangeText) lines.push(`verses: ${yamlString(ref.verseRangeText)}`);
		} else if (ref.kind === 'publication') {
			lines.push(`keysymbol: ${yamlString(ref.keySymbol)}`);
			if (ref.year) lines.push(`year: ${ref.year}`);
			if (ref.month) lines.push(`month: ${ref.month}`);
			if (ref.documentId) lines.push(`document: ${ref.documentId}`);
			if (ref.paragraphRangeText) lines.push(`paragraph: ${yamlString(ref.paragraphRangeText)}`);
		}
		if (colorName) lines.push(`highlight: ${yamlString(colorName)}`);
		if (created) lines.push(`created: ${yamlString(created)}`);
		if (modified) lines.push(`modified: ${yamlString(modified)}`);
		if (tags.length) {
			const tagList = tags.map((t) => yamlString(t)).join(', ');
			lines.push(`tags: [${tagList}]`);
		}
		lines.push(`guid: ${note.Guid}`);
		lines.push('---');
		lines.push('');
	}

	lines.push(`# ${titleLine}`);
	lines.push('');
	lines.push(`> **${ref.display}**${ref.source && ref.source !== 'Bíblia' ? ` — *${ref.source}*` : ''}`);
	lines.push('');
	if (note.Content?.trim()) {
		lines.push(note.Content.trim());
		lines.push('');
	}

	if (o.includeBacklink && tags.length) {
		lines.push('---');
		lines.push(tags.map((t) => `#${t.replace(/\s+/g, '-')}`).join(' '));
	}

	return { filename, folder, content: lines.join('\n'), ref };
}

/**
 * Export all (or filtered) notes to a ZIP of Markdown files.
 * Files placed under "Notas/" (or "Notas/{Year}/" when folderByYear).
 * Duplicate filenames get " (2)", " (3)" suffix.
 */
export function exportNotesToZip(
	db: Database,
	notes: Note[],
	opts: ExportOptions = {}
): Blob {
	const files: Record<string, Uint8Array> = {};
	const used = new Set<string>();

	for (const note of notes) {
		const { filename, folder, content } = noteToMarkdown(db, note, opts);
		let path = `${folder}/${filename}`;
		let i = 2;
		while (used.has(path)) {
			path = `${folder}/${filename.replace(/\.md$/, ` (${i}).md`)}`;
			i++;
		}
		used.add(path);
		files[path] = strToU8(content);
	}

	// Index file
	const indexLines = [
		'# Índice de Notas',
		'',
		`Exportadas em ${new Date().toLocaleString('pt-BR')}.`,
		`Total: ${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}.`,
		'',
		'## Por referência',
		''
	];
	for (const note of notes) {
		const { filename, folder, ref } = noteToMarkdown(db, note, opts);
		const link = `${folder}/${filename.replace(/\.md$/, '')}`;
		indexLines.push(`- [[${link}|${ref.display}]] — ${note.Title?.trim() || '(sem título)'}`);
	}
	files['Notas/_Índice.md'] = strToU8(indexLines.join('\n'));

	const zipped = zipSync(files, { level: 6 });
	return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

export function exportAllNotes(db: Database, opts: ExportOptions = {}): Blob {
	const all = listNotes(db, { limit: 100000 });
	return exportNotesToZip(db, all, opts);
}
