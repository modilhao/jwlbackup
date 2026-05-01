import { zipSync, strToU8 } from 'fflate';
import type { Database } from 'sql.js';
import type { Note } from '$lib/types';
import { bibleBookName } from '$lib/bible';
import { listNotes } from '$lib/queries';
import { getColorIndex, getNoteTags, resolveRef, type NoteRef } from '$lib/refs';
import { safeFilename } from '$lib/markdown';

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

interface ObsidianNoteFile {
	path: string;
	content: string;
	ref: NoteRef;
	tags: string[];
	title: string;
	note: Note;
}

function yamlString(value: string): string {
	if (
		/^[\w\s\-./:,()'"]+$/.test(value) &&
		!value.includes('\n') &&
		!value.startsWith(' ') &&
		!value.endsWith(' ')
	) {
		return value;
	}
	return JSON.stringify(value);
}

function yamlList(values: string[]): string {
	return `[${values.map((value) => yamlString(value)).join(', ')}]`;
}

function obsidianTag(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9/]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/\/+/g, '/');
}

function personalTag(value: string): string {
	const tag = obsidianTag(value);
	return tag ? `tema/${tag}` : 'tema/sem-etiqueta';
}

function isoDate(value: string): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toISOString();
}

function noteTitle(note: Note, ref: NoteRef): string {
	return note.Title?.trim() || ref.display || 'Sem título';
}

function notePath(note: Note, ref: NoteRef, title: string): string {
	const year = note.Created?.slice(0, 4) || 'sem-data';
	const sourceFolder = ref.kind === 'bible' ? 'Bíblia' : ref.kind === 'publication' ? 'Publicações' : 'Sem referência';
	const filename = safeFilename(`${ref.short} - ${title}`);
	return `JW Library/Notas/${sourceFolder}/${year}/${filename}.md`;
}

function versePath(ref: NoteRef, verse: number): string {
	const book = bibleBookName(ref.bookNumber) || 'Livro desconhecido';
	const chapter = ref.chapter ?? 0;
	const filename = safeFilename(`${book} ${chapter}.${verse}`);
	return `Bíblia/${safeFilename(book)}/${filename}.md`;
}

function frontmatter(lines: string[]): string {
	return ['---', ...lines, '---', ''].join('\n');
}

function noteToObsidianFile(db: Database, note: Note): ObsidianNoteFile {
	const ref = resolveRef(db, note);
	const tags = getNoteTags(db, note.NoteId);
	const mappedTags = tags.map(personalTag);
	const color = getColorIndex(db, note.UserMarkId);
	const colorName = color != null ? HIGHLIGHT_COLORS[color] ?? `cor ${color}` : null;
	const title = noteTitle(note, ref);
	const path = notePath(note, ref, title);

	const fm = [
		`title: ${yamlString(title)}`,
		`tipo: nota-jw-library`,
		`referencia: ${yamlString(ref.display)}`,
		`origem: ${yamlString(ref.source || ref.keySymbol || 'JW Library')}`,
		`jw_guid: ${yamlString(note.Guid)}`,
		`jw_note_id: ${note.NoteId}`,
		`criado: ${yamlString(isoDate(note.Created))}`,
		`modificado: ${yamlString(isoDate(note.LastModified))}`,
		`tags: ${yamlList(['jw-library', ...mappedTags])}`
	];

	if (ref.kind === 'bible') {
		fm.push(`livro: ${yamlString(bibleBookName(ref.bookNumber) || '')}`);
		fm.push(`capitulo: ${ref.chapter ?? ''}`);
		if (ref.verseRangeText) fm.push(`versiculos: ${yamlString(ref.verseRangeText)}`);
	}

	if (ref.kind === 'publication') {
		fm.push(`publicacao: ${yamlString(ref.keySymbol)}`);
		if (ref.year) fm.push(`ano: ${ref.year}`);
		if (ref.month) fm.push(`mes: ${ref.month}`);
		if (ref.documentId) fm.push(`documento: ${ref.documentId}`);
		if (ref.paragraphRangeText) fm.push(`paragrafos: ${yamlString(ref.paragraphRangeText)}`);
	}

	if (colorName) fm.push(`marcacao: ${yamlString(colorName)}`);

	const body: string[] = [frontmatter(fm), `# ${title}`, '', `> ${ref.display}`];
	if (ref.source && ref.source !== 'Bíblia') body[body.length - 1] += ` - ${ref.source}`;
	body.push('');

	if (ref.kind === 'bible' && ref.verses?.length) {
		body.push(ref.verses.map((verse) => `[[${bibleBookName(ref.bookNumber)} ${ref.chapter}.${verse}]]`).join(' '));
		body.push('');
	}

	if (note.Content?.trim()) {
		body.push(note.Content.trim());
		body.push('');
	}

	if (tags.length) {
		body.push('## Etiquetas');
		body.push('');
		for (const tag of tags) body.push(`- [[JW Library/MOCs/${safeFilename(tag)}|${tag}]]`);
		body.push('');
	}

	return { path, content: body.join('\n'), ref, tags, title, note };
}

function createVerseFiles(noteFiles: ObsidianNoteFile[]): Record<string, string> {
	const files: Record<string, string> = {};
	const backlinks = new Map<string, { ref: NoteRef; verse: number; notes: ObsidianNoteFile[] }>();

	for (const file of noteFiles) {
		if (file.ref.kind !== 'bible' || !file.ref.verses?.length) continue;
		for (const verse of file.ref.verses) {
			const path = versePath(file.ref, verse);
			const current = backlinks.get(path) ?? { ref: file.ref, verse, notes: [] };
			current.notes.push(file);
			backlinks.set(path, current);
		}
	}

	for (const [path, item] of backlinks) {
		const book = bibleBookName(item.ref.bookNumber) || 'Livro desconhecido';
		const title = `${book} ${item.ref.chapter}:${item.verse}`;
		const fm = frontmatter([
			`title: ${yamlString(title)}`,
			`tipo: versiculo-biblico`,
			`livro: ${yamlString(book)}`,
			`capitulo: ${item.ref.chapter ?? ''}`,
			`versiculo: ${item.verse}`,
			`tags: [biblia, jw-library]`
		]);
		const lines = [fm, `# ${title}`, '', '## Notas relacionadas', ''];
		for (const note of item.notes) {
			lines.push(`- [[${note.path.replace(/\.md$/, '')}|${note.title}]]`);
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
		const path = `JW Library/MOCs/${safeFilename(tag)}.md`;
		const fm = frontmatter([
			`title: ${yamlString(tag)}`,
			`tipo: moc-etiqueta-jw-library`,
			`tag_origem: ${yamlString(tag)}`,
			`tags: ${yamlList(['jw-library', personalTag(tag)])}`
		]);
		const lines = [fm, `# ${tag}`, '', `Total de notas: ${notes.length}`, ''];
		for (const note of notes) {
			lines.push(`- [[${note.path.replace(/\.md$/, '')}|${note.ref.display} - ${note.title}]]`);
		}
		files[path] = lines.join('\n');
	}
	return files;
}

function createHome(noteFiles: ObsidianNoteFile[], verseCount: number, tagMocCount: number): string {
	const recent = [...noteFiles]
		.sort((a, b) => (b.note.LastModified || '').localeCompare(a.note.LastModified || ''))
		.slice(0, 12);
	const lines = [
		frontmatter(['title: Espiritual', 'tipo: home-espiritual', 'tags: [jw-library, home]']),
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
		lines.push(`- [[${note.path.replace(/\.md$/, '')}|${note.ref.display} - ${note.title}]]`);
	}
	return lines.join('\n');
}

function createTemplates(): Record<string, string> {
	return {
		'Templates/JW Library - Nota pessoal.md': [
			'---',
			'title: "{{title}}"',
			'tipo: nota-jw-library',
			'tags: [jw-library]',
			'---',
			'',
			'# {{title}}',
			'',
			'> {{referencia}}',
			''
		].join('\n')
	};
}

export function exportObsidianVault(db: Database, notes: Note[] = listNotes(db, { limit: 100000 })): ObsidianExportResult {
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
	Object.assign(textFiles, createTemplates());

	const verseNotes = Object.keys(textFiles).filter((path) => path.startsWith('Bíblia/')).length;
	const tagMocs = Object.keys(textFiles).filter((path) => path.startsWith('JW Library/MOCs/')).length;
	textFiles['Espiritual.md'] = createHome(noteFiles, verseNotes, tagMocs);

	const files: Record<string, Uint8Array> = {};
	for (const [path, content] of Object.entries(textFiles)) files[path] = strToU8(content);

	const zipped = zipSync(files, { level: 6 });
	return {
		blob: new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }),
		summary: {
			notes: noteFiles.length,
			verseNotes,
			tagMocs,
			files: Object.keys(files).length
		}
	};
}
