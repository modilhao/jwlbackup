import { zipSync, strToU8 } from 'fflate';
import type { Database } from 'sql.js';
import type { Note } from '$lib/types';
import { listNotes } from '$lib/queries';
import { getColorIndex, getNoteTags, resolveRef, type NoteRef } from '$lib/refs';
import {
	atomicVerseLink,
	atomicVerseTags,
	atomicVersePath,
	frontmatter,
	hierarchicalTags,
	isoDate,
	issueYYYYMM,
	mocLink,
	mocPath,
	mocTags,
	notePath,
	refHeader,
	testamento,
	yamlList,
	yamlString
} from './schema';
import { bibleBookName } from '$lib/bible';
import { PUB_META } from '$lib/publications';

const HIGHLIGHT_COLORS = [
	'sem cor',
	'amarelo',
	'verde',
	'azul',
	'roxo',
	'rosa',
	'laranja'
];

export interface ObsidianExportSummary {
	notes: number;
	verseNotes: number;
	tagMocs: number;
	files: number;
}

export interface ObsidianExportResult {
	blob: Blob;
	summary: ObsidianExportSummary;
}

export interface ObsidianVaultFiles {
	files: Record<string, string>;
	notePaths: string[];
	summary: ObsidianExportSummary;
}

interface ObsidianNoteFile {
	path: string;
	content: string;
	ref: NoteRef;
	tags: string[];
	title: string;
	note: Note;
}

function noteUserTitle(note: Note): string {
	return note.Title?.trim() || '';
}

function buildBibleFrontmatter(
	note: Note,
	ref: NoteRef,
	rawTags: string[],
	colorName: string | null
): string[] {
	const fm: string[] = [
		'tipo: nota-jw',
		'fonte: jw-library'
	];
	const book = bibleBookName(ref.bookNumber);
	if (book) fm.push(`livro: ${yamlString(book)}`);
	if (ref.chapter != null) fm.push(`capitulo: ${ref.chapter}`);
	if (ref.verseRangeText) fm.push(`versiculo: ${yamlString(ref.verseRangeText)}`);
	const test = testamento(ref.bookNumber);
	if (test) fm.push(`testamento: ${test}`);
	if (ref.keySymbol) fm.push(`key-symbol: ${yamlString(ref.keySymbol)}`);
	fm.push(`created: ${yamlString(isoDate(note.Created))}`);
	fm.push(`modified: ${yamlString(isoDate(note.LastModified))}`);
	fm.push(`note-id: ${note.NoteId}`);
	fm.push(`note-guid: ${yamlString(note.Guid)}`);
	if (ref.verseRangeText && book && ref.chapter != null) {
		fm.push(`versiculo-base: ${yamlString(`[[${book} ${ref.chapter}.${ref.verseRangeText}]]`)}`);
	}
	if (rawTags.length) fm.push(`tags-jw: ${yamlList(rawTags)}`);
	fm.push(`tags: ${yamlList(hierarchicalTags({ ref, rawTags }))}`);
	if (colorName) fm.push(`marcacao: ${yamlString(colorName)}`);
	return fm;
}

function buildPublicationFrontmatter(
	note: Note,
	ref: NoteRef,
	rawTags: string[],
	colorName: string | null
): string[] {
	const fm: string[] = ['tipo: nota-jw', 'fonte: jw-library'];
	const pubName = PUB_META[ref.keySymbol]?.name ?? ref.keySymbol;
	if (pubName) fm.push(`publicacao: ${yamlString(pubName)}`);
	if (ref.keySymbol) fm.push(`key-symbol: ${yamlString(ref.keySymbol)}`);
	const issue = issueYYYYMM(ref.issue);
	if (issue) fm.push(`issue: ${issue}`);
	if (ref.documentId) fm.push(`documento: ${ref.documentId}`);
	if (ref.paragraphRangeText) fm.push(`paragrafos: ${yamlString(ref.paragraphRangeText)}`);
	fm.push(`created: ${yamlString(isoDate(note.Created))}`);
	fm.push(`modified: ${yamlString(isoDate(note.LastModified))}`);
	fm.push(`note-id: ${note.NoteId}`);
	fm.push(`note-guid: ${yamlString(note.Guid)}`);
	if (rawTags.length) fm.push(`tags-jw: ${yamlList(rawTags)}`);
	fm.push(`tags: ${yamlList(hierarchicalTags({ ref, rawTags }))}`);
	if (colorName) fm.push(`marcacao: ${yamlString(colorName)}`);
	return fm;
}

function buildUnknownFrontmatter(note: Note, ref: NoteRef, rawTags: string[]): string[] {
	const fm: string[] = ['tipo: nota-jw', 'fonte: jw-library'];
	fm.push(`created: ${yamlString(isoDate(note.Created))}`);
	fm.push(`modified: ${yamlString(isoDate(note.LastModified))}`);
	fm.push(`note-id: ${note.NoteId}`);
	fm.push(`note-guid: ${yamlString(note.Guid)}`);
	if (rawTags.length) fm.push(`tags-jw: ${yamlList(rawTags)}`);
	fm.push(`tags: ${yamlList(hierarchicalTags({ ref, rawTags }))}`);
	return fm;
}

function connectionsLines(rawTags: string[]): string[] {
	if (!rawTags.length) return [];
	const out: string[] = ['## Conexões', ''];
	for (const tag of rawTags) {
		out.push(`- [[${mocLink(tag)}|${tag}]]`);
	}
	out.push('');
	return out;
}

function bibleBody(note: Note, ref: NoteRef, title: string, rawTags: string[]): string {
	const header = refHeader(ref);
	const h1 = title ? `${header} — ${title}` : header;
	const lines: string[] = [`# ${h1}`, ''];

	if (ref.verses?.length && ref.bookNumber != null && ref.chapter != null) {
		lines.push('## Trecho destacado (TNM)', '', `[[${atomicVerseLink(ref)}]]`, '');
	}

	const content = note.Content?.trim();
	if (content) {
		lines.push('## Reflexão pessoal', '', content, '');
	}

	lines.push(...connectionsLines(rawTags));

	lines.push('## Aparece em', '', '*(Dataview vai listar aqui automaticamente.)*', '');
	return lines.join('\n');
}

function publicationBody(note: Note, ref: NoteRef, title: string, rawTags: string[]): string {
	const header = refHeader(ref);
	const h1 = title ? `${header} — ${title}` : header;
	const lines: string[] = [`# ${h1}`, ''];

	const content = note.Content?.trim();
	if (content) {
		lines.push('## Anotação', '', content, '');
	}

	lines.push(...connectionsLines(rawTags));

	lines.push('## Aparece em', '', '*(Dataview vai listar aqui automaticamente.)*', '');
	return lines.join('\n');
}

function unknownBody(note: Note, title: string): string {
	const h1 = title || '(sem título)';
	const lines: string[] = [`# ${h1}`, ''];
	const content = note.Content?.trim();
	if (content) {
		lines.push(content, '');
	}
	return lines.join('\n');
}

function noteToObsidianFile(db: Database, note: Note): ObsidianNoteFile {
	const ref = resolveRef(db, note);
	const rawTags = getNoteTags(db, note.NoteId);
	const color = getColorIndex(db, note.UserMarkId);
	const colorName = color != null ? HIGHLIGHT_COLORS[color] ?? `cor ${color}` : null;
	const title = noteUserTitle(note);
	const path = notePath(ref, title);

	let fm: string[];
	let body: string;
	if (ref.kind === 'bible') {
		fm = buildBibleFrontmatter(note, ref, rawTags, colorName);
		body = bibleBody(note, ref, title, rawTags);
	} else if (ref.kind === 'publication') {
		fm = buildPublicationFrontmatter(note, ref, rawTags, colorName);
		body = publicationBody(note, ref, title, rawTags);
	} else {
		fm = buildUnknownFrontmatter(note, ref, rawTags);
		body = unknownBody(note, title);
	}

	const content = `${frontmatter(fm)}${body}`;
	return { path, content, ref, tags: rawTags, title, note };
}

function createVerseFiles(noteFiles: ObsidianNoteFile[]): Record<string, string> {
	const files: Record<string, string> = {};
	const backlinks = new Map<
		string,
		{ ref: NoteRef; verse: number; notes: ObsidianNoteFile[] }
	>();

	for (const file of noteFiles) {
		if (file.ref.kind !== 'bible' || !file.ref.verses?.length) continue;
		for (const verse of file.ref.verses) {
			const path = atomicVersePath(file.ref, verse);
			const current = backlinks.get(path) ?? { ref: file.ref, verse, notes: [] };
			current.notes.push(file);
			backlinks.set(path, current);
		}
	}

	for (const [path, item] of backlinks) {
		const book = bibleBookName(item.ref.bookNumber) || 'Livro desconhecido';
		const heading = `${book} ${item.ref.chapter}:${item.verse}`;
		const test = testamento(item.ref.bookNumber);
		const fm: string[] = ['tipo: atomic-verse', 'fonte: tnm'];
		if (book) fm.push(`livro: ${yamlString(book)}`);
		if (item.ref.chapter != null) fm.push(`capitulo: ${item.ref.chapter}`);
		fm.push(`versiculo: ${item.verse}`);
		if (test) fm.push(`testamento: ${test}`);
		fm.push('status: faltante-tnm');
		fm.push(`tags: ${yamlList(atomicVerseTags(item.ref))}`);

		const lines: string[] = [
			frontmatter(fm),
			`# ${heading}`,
			'',
			'## Texto (TNM)',
			'',
			'*Aguardando preenchimento — `status: faltante-tnm`.*',
			'',
			'## Notas relacionadas',
			''
		];
		for (const note of item.notes) {
			const target = note.path.replace(/\.md$/, '');
			const titleLabel = note.title || refHeader(note.ref);
			lines.push(`- [[${target}|${titleLabel}]]`);
		}
		files[path] = lines.join('\n');
	}

	return files;
}

function createTagMocs(noteFiles: ObsidianNoteFile[]): Record<string, string> {
	const byTag = new Map<string, ObsidianNoteFile[]>();
	for (const file of noteFiles) {
		for (const tag of file.tags) {
			const current = byTag.get(tag) ?? [];
			current.push(file);
			byTag.set(tag, current);
		}
	}

	const files: Record<string, string> = {};
	for (const [tag, notes] of byTag) {
		const path = mocPath(tag);
		const fm = frontmatter([
			'tipo: moc',
			`tag-jw: ${yamlString(tag)}`,
			`tags: ${yamlList(mocTags(tag))}`
		]);
		const lines: string[] = [fm, `# ${tag}`, '', `Total de notas: ${notes.length}`, ''];
		for (const note of notes) {
			const target = note.path.replace(/\.md$/, '');
			const display = note.title
				? `${refHeader(note.ref)} — ${note.title}`
				: refHeader(note.ref);
			lines.push(`- [[${target}|${display}]]`);
		}
		files[path] = lines.join('\n');
	}
	return files;
}

function createHome(noteFiles: ObsidianNoteFile[], verseCount: number, tagMocCount: number): string {
	const recent = [...noteFiles]
		.sort((a, b) => (b.note.LastModified || '').localeCompare(a.note.LastModified || ''))
		.slice(0, 12);
	const lines: string[] = [
		frontmatter(['tipo: home', 'tags: [tipo/home]']),
		'# Espiritual',
		'',
		'## Resumo',
		'',
		`- Notas pessoais: ${noteFiles.length}`,
		`- Versículos atômicos: ${verseCount}`,
		`- MOCs por etiqueta: ${tagMocCount}`,
		'',
		'## Notas recentes',
		''
	];
	for (const note of recent) {
		const target = note.path.replace(/\.md$/, '');
		const display = note.title
			? `${refHeader(note.ref)} — ${note.title}`
			: refHeader(note.ref);
		lines.push(`- [[${target}|${display}]]`);
	}
	return lines.join('\n');
}

export function buildObsidianVaultFiles(
	db: Database,
	notes: Note[] = listNotes(db, { limit: 100000 })
): ObsidianVaultFiles {
	const noteFiles = notes.map((note) => noteToObsidianFile(db, note));
	const textFiles: Record<string, string> = {};

	for (const file of noteFiles) {
		let path = file.path;
		let i = 2;
		while (textFiles[path]) {
			path = file.path.replace(/\.md$/, ` (${i}).md`);
			i++;
		}
		file.path = path;
		textFiles[path] = file.content;
	}

	Object.assign(textFiles, createVerseFiles(noteFiles));
	Object.assign(textFiles, createTagMocs(noteFiles));

	const verseNotes = Object.keys(textFiles).filter((path) => path.startsWith('Bíblia/')).length;
	const tagMocs = Object.keys(textFiles).filter((path) => path.startsWith('_MOCs/')).length;
	textFiles['Espiritual.md'] = createHome(noteFiles, verseNotes, tagMocs);

	return {
		files: textFiles,
		notePaths: noteFiles.map((file) => file.path),
		summary: {
			notes: noteFiles.length,
			verseNotes,
			tagMocs,
			files: Object.keys(textFiles).length
		}
	};
}

export function exportObsidianVault(
	db: Database,
	notes: Note[] = listNotes(db, { limit: 100000 })
): ObsidianExportResult {
	const vault = buildObsidianVaultFiles(db, notes);
	const files: Record<string, Uint8Array> = {};
	for (const [path, content] of Object.entries(vault.files)) files[path] = strToU8(content);

	const zipped = zipSync(files, { level: 6 });
	return {
		blob: new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }),
		summary: vault.summary
	};
}
