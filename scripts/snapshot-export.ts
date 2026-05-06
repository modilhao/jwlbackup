// Snapshot baseline do output atual dos exportadores (Markdown antigo + Vault Obsidian novo).
// Roda contra claude/jwlibrary_extract/userData.db já extraído do backup do Marcel.
// Saída: claude/snapshots/0001-baseline/
//
// Uso:
//   bun run snapshot
//   (ou diretamente: bun scripts/snapshot-export.ts)
//
// Por que: serve de linha-de-partida pra detectar regressões nas Fases 1-5
// (refatoração do schema, reconciliação V2, estudos via API V3).
// Detalhes: claude/snapshots/README.md e claude/ESTUDO - Arquitetura Obsidian Export.md §10.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';

import { buildObsidianVaultFiles, type ObsidianVaultFiles } from '../src/lib/obsidian/exporter';
import { noteToMarkdown } from '../src/lib/markdown';
import { listNotes } from '../src/lib/queries';
import { resolveRef } from '../src/lib/refs';
import type { Note } from '../src/lib/types';

const ROOT = resolve(import.meta.dir, '..');
const DB_PATH = resolve(ROOT, 'claude/jwlibrary_extract/userData.db');
const OUT_DIR = resolve(ROOT, 'claude/snapshots/0001-baseline');
const VAULT_DIR = resolve(OUT_DIR, 'vault-novo');
const MD_DIR = resolve(OUT_DIR, 'markdown-antigo');

/**
 * Encontra o path no vault gerado que corresponde a uma Note específica.
 * Robusto a mudanças de path/folder entre versões — busca pelo jw_note_id no frontmatter.
 */
function findPathByNoteId(vault: ObsidianVaultFiles, noteId: number): string | undefined {
	const re = new RegExp(`^jw_note_id:\\s*${noteId}\\b`, 'm');
	for (const [path, content] of Object.entries(vault.files)) {
		if (re.test(content)) return path;
	}
	return undefined;
}

/**
 * Pega a primeira nota (por LastModified DESC, que é a ordem padrão de listNotes)
 * que satisfaz o predicate. Determinístico entre runs.
 */
function pickNote(notes: Note[], predicate: (n: Note) => boolean): Note | undefined {
	return notes.find(predicate);
}

function writeWithHeader(path: string, headerComment: string, content: string) {
	writeFileSync(path, `<!-- ${headerComment} -->\n${content}\n`);
}

async function main() {
	if (!existsSync(DB_PATH)) {
		console.error(`✗ Database not found: ${DB_PATH}`);
		console.error(`  Esperado: backup já extraído pra claude/jwlibrary_extract/userData.db`);
		process.exit(1);
	}

	console.log(`→ Carregando ${DB_PATH}`);
	const SQL = await initSqlJs({
		locateFile: (file: string) => resolve(ROOT, 'node_modules/sql.js/dist', file)
	});
	const db = new SQL.Database(readFileSync(DB_PATH));

	mkdirSync(VAULT_DIR, { recursive: true });
	mkdirSync(MD_DIR, { recursive: true });

	// ── Selecionar notas representativas (determinístico, por NoteId) ──
	const allNotes = listNotes(db, { limit: 100000 });
	const firstBible = pickNote(allNotes, (n) => resolveRef(db, n).kind === 'bible');
	const firstPub = pickNote(allNotes, (n) => resolveRef(db, n).kind === 'publication');

	if (!firstBible || !firstPub) {
		console.error(`✗ Não encontrei notas representativas. Bíblica: ${!!firstBible}, Publicação: ${!!firstPub}`);
		process.exit(1);
	}

	console.log(`  Total de notas: ${allNotes.length}`);
	console.log(`  Sample bíblica:    NoteId=${firstBible.NoteId} → ${resolveRef(db, firstBible).display}`);
	console.log(`  Sample publicação: NoteId=${firstPub.NoteId} → ${resolveRef(db, firstPub).display}`);

	// ── EXPORTADOR 1: Vault Obsidian novo (src/lib/obsidian/exporter.ts) ──
	console.log(`→ Gerando vault Obsidian novo...`);
	const vault = buildObsidianVaultFiles(db);
	const sortedPaths = Object.keys(vault.files).sort();

	// _index.txt — lista ordenada de TODOS os paths gerados (auditoria)
	writeFileSync(
		resolve(VAULT_DIR, '_index.txt'),
		[
			...sortedPaths,
			'',
			'---',
			`Total: ${sortedPaths.length} arquivos`,
			`Notas: ${vault.summary.notes}`,
			`Versículos atômicos: ${vault.summary.verseNotes}`,
			`MOCs: ${vault.summary.tagMocs}`
		].join('\n') + '\n'
	);

	// 5 samples representativos
	const biblePath = findPathByNoteId(vault, firstBible.NoteId);
	const pubPath = findPathByNoteId(vault, firstPub.NoteId);
	const firstVerse = sortedPaths.find((p) => p.startsWith('Bíblia/') && p.endsWith('.md'));
	const firstMoc = sortedPaths.find(
		(p) => p.startsWith('JW Library/MOCs/') && p.endsWith('.md')
	);

	if (biblePath) {
		writeWithHeader(
			resolve(VAULT_DIR, 'sample-nota-biblia.md'),
			`snapshot path: ${biblePath}`,
			vault.files[biblePath]
		);
	}
	if (pubPath) {
		writeWithHeader(
			resolve(VAULT_DIR, 'sample-nota-publicacao.md'),
			`snapshot path: ${pubPath}`,
			vault.files[pubPath]
		);
	}
	if (firstVerse) {
		writeWithHeader(
			resolve(VAULT_DIR, 'sample-versiculo-atomico.md'),
			`snapshot path: ${firstVerse}`,
			vault.files[firstVerse]
		);
	}
	if (firstMoc) {
		writeWithHeader(
			resolve(VAULT_DIR, 'sample-moc.md'),
			`snapshot path: ${firstMoc}`,
			vault.files[firstMoc]
		);
	}
	if (vault.files['Espiritual.md']) {
		writeWithHeader(
			resolve(VAULT_DIR, 'sample-espiritual-home.md'),
			`snapshot path: Espiritual.md`,
			vault.files['Espiritual.md']
		);
	}

	// ── EXPORTADOR 2: Markdown antigo (src/lib/markdown.ts) ──
	console.log(`→ Gerando snapshots do exportador Markdown antigo...`);
	const mdBible = noteToMarkdown(db, firstBible);
	const mdPub = noteToMarkdown(db, firstPub);

	writeFileSync(
		resolve(MD_DIR, '_index.txt'),
		[
			`Total de notas: ${allNotes.length}`,
			'',
			`Sample bíblica:`,
			`  NoteId=${firstBible.NoteId}`,
			`  Path=${mdBible.folder}/${mdBible.filename}`,
			`  Ref=${mdBible.ref.display}`,
			'',
			`Sample publicação:`,
			`  NoteId=${firstPub.NoteId}`,
			`  Path=${mdPub.folder}/${mdPub.filename}`,
			`  Ref=${mdPub.ref.display}`
		].join('\n') + '\n'
	);

	writeWithHeader(
		resolve(MD_DIR, 'sample-nota-biblia.md'),
		`snapshot path: ${mdBible.folder}/${mdBible.filename}`,
		mdBible.content
	);
	writeWithHeader(
		resolve(MD_DIR, 'sample-nota-publicacao.md'),
		`snapshot path: ${mdPub.folder}/${mdPub.filename}`,
		mdPub.content
	);

	// ── METADATA ──
	writeFileSync(
		resolve(OUT_DIR, 'METADATA.md'),
		[
			'# Snapshot 0001 — baseline pré-Fase 1',
			'',
			`Gerado em: ${new Date().toISOString()}`,
			`Source DB: \`claude/jwlibrary_extract/userData.db\``,
			'',
			'## Sumário do vault novo (`obsidian/exporter.ts`)',
			'',
			`- Notas pessoais: **${vault.summary.notes}**`,
			`- Versículos atômicos: **${vault.summary.verseNotes}**`,
			`- MOCs por etiqueta: **${vault.summary.tagMocs}**`,
			`- Total de arquivos: **${vault.summary.files}**`,
			'',
			'## Sumário do markdown antigo (`markdown.ts`)',
			'',
			`- Total de notas: **${allNotes.length}**`,
			`- Estrutura: \`Notas/<arquivo>.md\` + \`_Índice.md\``,
			'',
			'## Notas representativas escolhidas',
			'',
			`| Tipo | NoteId | Referência | Critério |`,
			`|---|---|---|---|`,
			`| Bíblica | ${firstBible.NoteId} | ${resolveRef(db, firstBible).display} | Primeira (LastModified DESC) com BlockType=2 e KeySymbol bíblico |`,
			`| Publicação | ${firstPub.NoteId} | ${resolveRef(db, firstPub).display} | Primeira (LastModified DESC) com KeySymbol não-bíblico |`,
			'',
			'## Como recomparar após uma Fase',
			'',
			'```bash',
			'bun run snapshot                        # gera novo output',
			'git diff claude/snapshots/0001-baseline # ve o diff',
			'```',
			'',
			'Detalhes: ver `claude/snapshots/README.md` para o protocolo.',
			''
		].join('\n')
	);

	console.log(`\n✓ Snapshot gerado em: ${OUT_DIR}`);
	console.log(`  Vault novo:       ${vault.summary.files} arquivos (samples + _index)`);
	console.log(`  Markdown antigo:  ${allNotes.length} notas (samples + _index)`);
	console.log(`\nPróximo passo: revisar e commitar claude/snapshots/0001-baseline/`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
