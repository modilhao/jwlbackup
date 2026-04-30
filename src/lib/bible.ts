// Bible book names — Tradução do Novo Mundo (Brazilian Portuguese)
// Index 0 unused; 1..66 maps BookNumber → name.
export const BIBLE_BOOKS_PT: readonly string[] = [
	'',
	'Gênesis',
	'Êxodo',
	'Levítico',
	'Números',
	'Deuteronômio',
	'Josué',
	'Juízes',
	'Rute',
	'1 Samuel',
	'2 Samuel',
	'1 Reis',
	'2 Reis',
	'1 Crônicas',
	'2 Crônicas',
	'Esdras',
	'Neemias',
	'Ester',
	'Jó',
	'Salmos',
	'Provérbios',
	'Eclesiastes',
	'Cântico de Salomão',
	'Isaías',
	'Jeremias',
	'Lamentações',
	'Ezequiel',
	'Daniel',
	'Oseias',
	'Joel',
	'Amós',
	'Obadias',
	'Jonas',
	'Miqueias',
	'Naum',
	'Habacuque',
	'Sofonias',
	'Ageu',
	'Zacarias',
	'Malaquias',
	'Mateus',
	'Marcos',
	'Lucas',
	'João',
	'Atos',
	'Romanos',
	'1 Coríntios',
	'2 Coríntios',
	'Gálatas',
	'Efésios',
	'Filipenses',
	'Colossenses',
	'1 Tessalonicenses',
	'2 Tessalonicenses',
	'1 Timóteo',
	'2 Timóteo',
	'Tito',
	'Filêmon',
	'Hebreus',
	'Tiago',
	'1 Pedro',
	'2 Pedro',
	'1 João',
	'2 João',
	'3 João',
	'Judas',
	'Apocalipse'
];

// Bible KeySymbols (NM editions). Anything in this set is treated as Bible.
export const BIBLE_KEY_SYMBOLS = new Set(['nwtsty', 'nwt', 'bi12', 'bi10', 'Rbi8']);

export function isBibleKeySymbol(sym: string | null | undefined): boolean {
	return !!sym && BIBLE_KEY_SYMBOLS.has(sym);
}

export function bibleBookName(bookNumber: number | null | undefined): string {
	if (!bookNumber || bookNumber < 1 || bookNumber > 66) return '';
	return BIBLE_BOOKS_PT[bookNumber];
}
