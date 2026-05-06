// Verdade-fonte do schema do vault Obsidian (Fase 1).
// Helpers puros: slugs, testamento, paths, naming, frontmatter primitives.
// Não conhece sql.js nem Note — recebe NoteRef e devolve strings.

import type { NoteRef } from '$lib/refs';
import { bibleBookName } from '$lib/bible';
import { issueShort, PUB_META } from '$lib/publications';
import { safeFilename } from '$lib/markdown';

// ─────────────────────────── Slugs ───────────────────────────

/** NFD-strip diacritics, lowercase, kebab. Preserva `/`. */
export function tagSlug(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9/]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/\/+/g, '/');
}

/** Slug de livro bíblico: `Isaías → isaias`, `1 Coríntios → 1-corintios`. */
export function bookSlug(bookNumber: number | null | undefined): string {
	const name = bibleBookName(bookNumber);
	return name ? tagSlug(name) : '';
}

/** AT (1-39) ou NT (40-66). Vazio se inválido. */
export function testamento(bookNumber: number | null | undefined): 'AT' | 'NT' | '' {
	if (!bookNumber || bookNumber < 1 || bookNumber > 66) return '';
	return bookNumber <= 39 ? 'AT' : 'NT';
}

// ─────────────────────────── Publicações ───────────────────────────

/** Nome curto pra filename/H1: `w → Sentinela`. Fallback: keysymbol. */
const PUB_SHORT: Record<string, string> = {
	w: 'Sentinela',
	wp: 'Sentinela Pública',
	g: 'Despertai',
	mwb: 'Vida e Ministério',
	jy: 'Jesus',
	lff: 'Vida Feliz',
	lfb: 'Bom para Sempre',
	rr: 'Reino de Deus',
	bt: 'Testemunho Cabal',
	it: 'Estudo Perspicaz',
	bhs: 'Aprenda Bíblia',
	bh: 'O que a Bíblia',
	cl: 'Aproxime-se de Jeová',
	gt: 'Maior Homem',
	yp: 'Jovens Perguntam',
	od: 'Organizados',
	sjj: 'Cantemos a Jeová',
	si: 'Toda Escritura',
	sfl: 'Firme com Fé',
	lmd: 'Ame as Pessoas',
	es: 'Anuário',
	lr: 'Examine as Escrituras Diariamente'
};

export function pubShort(keySymbol: string): string {
	return PUB_SHORT[keySymbol] ?? keySymbol;
}

/** Slug pra tag `fonte/pub/<slug>`: `w → sentinela`. */
export function pubSlug(keySymbol: string): string {
	const short = PUB_SHORT[keySymbol];
	return short ? tagSlug(short) : tagSlug(keySymbol);
}

/** IssueTagNumber → YYYYMM. `20260200 → 202602`. Vazio se inválido. */
export function issueYYYYMM(issue: number | null | undefined): string {
	if (!issue || issue < 19000000) return '';
	const s = String(issue);
	if (s.length < 6) return '';
	return s.slice(0, 6);
}

// ─────────────────────────── Paths e naming ───────────────────────────

/** Header humano da nota (filename + H1). Não inclui o título do usuário. */
export function refHeader(ref: NoteRef): string {
	if (ref.kind === 'bible') {
		const book = bibleBookName(ref.bookNumber) || 'Livro desconhecido';
		const chapter = ref.chapter ?? '';
		const vers = ref.verseRangeText;
		return vers ? `${book} ${chapter}:${vers}` : `${book} ${chapter}`;
	}
	if (ref.kind === 'publication') {
		const short = pubShort(ref.keySymbol);
		const iss = issueShort(ref.issue);
		return iss ? `${short} ${iss}` : short;
	}
	return ref.display;
}

/** Header curto pra filename (usa `.` em vez de `:`). */
export function refHeaderShort(ref: NoteRef): string {
	if (ref.kind === 'bible') {
		const book = bibleBookName(ref.bookNumber) || 'Livro desconhecido';
		const chapter = ref.chapter ?? '';
		const vers = ref.verseRangeText;
		return vers ? `${book} ${chapter}.${vers}` : `${book} ${chapter}`;
	}
	return refHeader(ref);
}

/** Path da nota pessoal no vault. Sem `/{ano}/`. */
export function notePath(ref: NoteRef, title: string): string {
	const header = refHeaderShort(ref);
	const stem = title ? `${header} — ${title}` : header;
	const filename = `${safeFilename(stem)}.md`;

	if (ref.kind === 'bible') {
		const book = bibleBookName(ref.bookNumber) || 'Livro desconhecido';
		return `JW Library/Notas/Bíblia/${safeFilename(book)}/${filename}`;
	}
	if (ref.kind === 'publication') {
		const pubFolder = PUB_META[ref.keySymbol]?.name ?? ref.keySymbol;
		return `JW Library/Notas/Publicações/${safeFilename(pubFolder)}/${filename}`;
	}
	return `JW Library/Notas/Sem referência/${filename}`;
}

/** Path do versículo atômico. */
export function atomicVersePath(ref: NoteRef, verse: number): string {
	const book = bibleBookName(ref.bookNumber) || 'Livro desconhecido';
	const chapter = ref.chapter ?? 0;
	return `Bíblia/${safeFilename(book)}/${safeFilename(`${book} ${chapter}.${verse}`)}.md`;
}

/** Wikilink-target pro atomic verse (sem `.md`). */
export function atomicVerseLink(ref: NoteRef): string {
	const book = bibleBookName(ref.bookNumber) || 'Livro desconhecido';
	const chapter = ref.chapter ?? 0;
	const vers = ref.verseRangeText;
	return vers ? `${book} ${chapter}.${vers}` : `${book} ${chapter}`;
}

/** Path de MOC: `_MOCs/MOC - <Tema>.md`. */
export function mocPath(tag: string): string {
	return `_MOCs/${safeFilename(`MOC - ${tag}`)}.md`;
}

/** Wikilink-target pro MOC. */
export function mocLink(tag: string): string {
	return `_MOCs/${safeFilename(`MOC - ${tag}`)}`;
}

// ─────────────────────────── YAML primitives ───────────────────────────

export function yamlString(value: string): string {
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

export function yamlList(values: string[]): string {
	return `[${values.map((v) => yamlString(v)).join(', ')}]`;
}

export function frontmatter(lines: string[]): string {
	return ['---', ...lines, '---', ''].join('\n');
}

/** ISO-normalize, mantém timezone original quando válido. */
export function isoDate(value: string): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toISOString();
}

// ─────────────────────────── Hierarchical tags ───────────────────────────

export interface HierarchicalTagsInput {
	ref: NoteRef;
	rawTags: string[];
}

/** Monta `tags:` hierárquico canônico pra nota pessoal. */
export function hierarchicalTags({ ref, rawTags }: HierarchicalTagsInput): string[] {
	const out: string[] = ['tipo/nota-jw'];

	if (ref.kind === 'bible') {
		const test = testamento(ref.bookNumber);
		const slug = bookSlug(ref.bookNumber);
		if (test && slug) out.push(`livro/${test.toLowerCase()}/${slug}`);
		out.push('fonte/biblia');
	} else if (ref.kind === 'publication') {
		out.push(`fonte/pub/${pubSlug(ref.keySymbol)}`);
	}

	for (const t of rawTags) {
		const slug = tagSlug(t);
		if (slug) out.push(`tema/${slug}`);
	}

	return out;
}

/** Tags canônicas pra atomic verse. */
export function atomicVerseTags(ref: NoteRef): string[] {
	const out = ['tipo/atomic-verse'];
	const test = testamento(ref.bookNumber);
	const slug = bookSlug(ref.bookNumber);
	if (test && slug) out.push(`livro/${test.toLowerCase()}/${slug}`);
	out.push('fonte/biblia');
	return out;
}

/** Tags canônicas pra MOC. */
export function mocTags(tag: string): string[] {
	return ['tipo/moc', `tema/${tagSlug(tag)}`];
}
