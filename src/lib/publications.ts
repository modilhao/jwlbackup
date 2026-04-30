// Publication metadata for human-readable references.
// Not exhaustive — covers the most common KeySymbols seen in JW Library backups.
// Add more as needed; unknown KeySymbols fall back to the raw symbol.

export interface PubMeta {
	name: string;
	type: 'magazine' | 'book' | 'brochure' | 'meeting' | 'tract' | 'misc';
}

export const PUB_META: Record<string, PubMeta> = {
	w: { name: 'A Sentinela (Estudo)', type: 'magazine' },
	wp: { name: 'A Sentinela (Edição Pública)', type: 'magazine' },
	g: { name: 'Despertai!', type: 'magazine' },
	mwb: { name: 'Apostila Vida e Ministério', type: 'meeting' },
	jy: { name: 'Jesus, o Caminho, a Verdade e a Vida', type: 'book' },
	lff: { name: 'Vida Feliz Para Sempre!', type: 'brochure' },
	lfb: { name: 'Bom Para Sempre', type: 'book' },
	rr: { name: 'O Reino de Deus Já Reina', type: 'book' },
	bt: { name: 'Testemunho Cabal', type: 'book' },
	it: { name: 'Estudo Perspicaz das Escrituras', type: 'book' },
	bhs: { name: 'Aprenda a Bíblia', type: 'book' },
	es: { name: 'Anuário', type: 'book' },
	es25: { name: 'Anuário 2025', type: 'book' },
	lmd: { name: 'Ame as Pessoas — Faça Discípulos', type: 'brochure' },
	sfl: { name: 'Mantenha-se Firme com Fé', type: 'book' },
	sjj: { name: 'Cantemos a Jeová!', type: 'book' },
	si: { name: 'Toda Escritura', type: 'book' },
	cl: { name: 'Aproxime-se de Jeová', type: 'book' },
	bh: { name: 'O que a Bíblia Realmente Ensina?', type: 'book' },
	gt: { name: 'O Maior Homem que Já Viveu', type: 'book' },
	yp: { name: 'Os Jovens Perguntam', type: 'book' },
	od: { name: 'Organizados', type: 'book' },
	'S-34': { name: 'Texto do Ano (S-34)', type: 'misc' }
};

export function pubLabel(keySymbol: string | null | undefined): string {
	if (!keySymbol) return '';
	return PUB_META[keySymbol]?.name ?? keySymbol;
}

/**
 * Format an IssueTagNumber (e.g. 20260100) as `YY.MM` (e.g. "26.01").
 * Returns empty string when not a valid magazine issue.
 */
export function issueShort(issue: number | null | undefined): string {
	if (!issue || issue < 19000000) return '';
	const s = String(issue);
	if (s.length < 6) return '';
	const yy = s.slice(2, 4);
	const mm = s.slice(4, 6);
	return `${yy}.${mm}`;
}
