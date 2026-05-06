// Sync V2 — atualiza vault Obsidian existente preservando edições do user.
//
// Estratégia (Fase 1.5):
//   1. Match por `note-guid` (V2). `jw_guid` legacy → skip + relatório.
//   2. Em notas existentes, sobrescreve apenas SYNC_AUTO_MANAGED_FIELDS.
//      Body inteiro e demais campos do FM ficam intactos.
//   3. Notas novas → escritas no path gerado pelo exporter.
//   4. Atomic verses + MOCs → cria se faltar; patch FM auto-managed se existir.
//   5. Espiritual.md → nunca tocado (regenerar via ZIP).
//
// Esta função NÃO move arquivos: se o user renomeou um .md, sync escreve
// no path existente (descoberto via note-guid), não no path gerado.

import type { ObsidianVaultFiles } from './exporter';
import { SYNC_AUTO_MANAGED_FIELDS, syncTipoFromFm, type SyncTipo } from './schema';

interface FileSystemFileHandle {
	kind: 'file';
	name: string;
	getFile(): Promise<File>;
	createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
	kind: 'directory';
	name: string;
	entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
	getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
	getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemWritableFileStream extends WritableStream {
	write(data: string | Blob | BufferSource): Promise<void>;
	close(): Promise<void>;
}

export interface ObsidianSyncSummary {
	created: number;
	updated: number;
	unchanged: number;
	conflicts: number;
	legacySkipped: number;
	supportCreated: number;
	reportPath: string;
}

interface ExistingNote {
	path: string;
	content: string;
	handle: FileSystemFileHandle;
}

export function supportsDirectorySync(): boolean {
	return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
	const picker = (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
	return picker();
}

// ─────────────────────────── Frontmatter parsing ───────────────────────────

interface ParsedDocument {
	valid: boolean;
	fmLines: string[]; // lines between the two `---`, in order
	body: string; // everything after the closing `---\n`
}

function parseDocument(content: string): ParsedDocument {
	if (!content.startsWith('---\n')) return { valid: false, fmLines: [], body: content };
	const rest = content.slice(4);
	const closeIdx = rest.indexOf('\n---\n');
	if (closeIdx === -1) return { valid: false, fmLines: [], body: content };
	const fmRaw = rest.slice(0, closeIdx);
	const body = rest.slice(closeIdx + 5);
	const fmLines = fmRaw.split('\n');
	return { valid: true, fmLines, body };
}

function fmKey(line: string): string | null {
	const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:/);
	return m ? m[1] : null;
}

function fmFieldsMap(fmLines: string[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const line of fmLines) {
		const k = fmKey(line);
		if (!k || map.has(k)) continue;
		const idx = line.indexOf(':');
		map.set(k, line.slice(idx + 1).trim());
	}
	return map;
}

function extractGuid(content: string): { kind: 'v2' | 'v1' | null; guid: string | null } {
	const v2 = content.match(/^note-guid:\s*["']?([^"'\n]+)["']?\s*$/m);
	if (v2) return { kind: 'v2', guid: v2[1].trim() };
	const v1 = content.match(/^jw_guid:\s*["']?([^"'\n]+)["']?\s*$/m);
	if (v1) return { kind: 'v1', guid: v1[1].trim() };
	return { kind: null, guid: null };
}

// ─────────────────────────── FM merge (auto-managed only) ───────────────────────────

/**
 * Substitui no FM existente apenas os campos listados em `autoFields`,
 * usando os valores do FM gerado. Campos auto-managed que sumiram do
 * gerado são removidos; novos são acrescentados ao fim. Demais linhas
 * (user-managed) permanecem em ordem original.
 */
function mergeAutoManaged(
	existing: string[],
	generated: string[],
	autoFields: readonly string[]
): { merged: string[]; changed: boolean } {
	const auto = new Set<string>(autoFields);
	const generatedByKey = new Map<string, string>();
	for (const line of generated) {
		const k = fmKey(line);
		if (k && auto.has(k) && !generatedByKey.has(k)) generatedByKey.set(k, line);
	}

	const merged: string[] = [];
	const seen = new Set<string>();
	for (const line of existing) {
		const k = fmKey(line);
		if (k && auto.has(k)) {
			const replacement = generatedByKey.get(k);
			if (replacement !== undefined) {
				merged.push(replacement);
				seen.add(k);
			}
			// se gerado não tem mais esse campo auto, remove
			continue;
		}
		merged.push(line);
	}
	// auto fields novos (estavam no gerado, faltam no existente) → append
	for (const [k, line] of generatedByKey) {
		if (!seen.has(k)) merged.push(line);
	}

	const changed = existing.length !== merged.length || existing.some((line, i) => line !== merged[i]);
	return { merged, changed };
}

function rebuildContent(fmLines: string[], body: string): string {
	return `---\n${fmLines.join('\n')}\n---\n${body}`;
}

// ─────────────────────────── FS helpers ───────────────────────────

function pathParts(path: string): string[] {
	return path.split('/').filter(Boolean);
}

async function getDirectory(root: FileSystemDirectoryHandle, parts: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
	let current = root;
	for (const part of parts) current = await current.getDirectoryHandle(part, { create });
	return current;
}

async function readText(handle: FileSystemFileHandle): Promise<string> {
	return (await handle.getFile()).text();
}

async function writeText(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
	const parts = pathParts(path);
	const filename = parts.pop();
	if (!filename) return;
	const directory = await getDirectory(root, parts, true);
	const file = await directory.getFileHandle(filename, { create: true });
	const writable = await file.createWritable();
	await writable.write(content);
	await writable.close();
}

async function writeTextHandle(handle: FileSystemFileHandle, content: string): Promise<void> {
	const writable = await handle.createWritable();
	await writable.write(content);
	await writable.close();
}

async function fileExists(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
	const parts = pathParts(path);
	const filename = parts.pop();
	if (!filename) return false;
	try {
		const directory = await getDirectory(root, parts, false);
		await directory.getFileHandle(filename);
		return true;
	} catch {
		return false;
	}
}

async function collectMarkdown(root: FileSystemDirectoryHandle): Promise<ExistingNote[]> {
	const out: ExistingNote[] = [];

	async function walk(directory: FileSystemDirectoryHandle, prefix: string): Promise<void> {
		for await (const [name, handle] of directory.entries()) {
			const path = prefix ? `${prefix}/${name}` : name;
			if (handle.kind === 'directory') {
				await walk(handle, path);
			} else if (name.toLowerCase().endsWith('.md')) {
				out.push({ path, content: await readText(handle), handle });
			}
		}
	}

	await walk(root, '');
	return out;
}

// ─────────────────────────── Conflict + report ───────────────────────────

function conflictPath(originalPath: string): string {
	const stamp = new Date().toISOString().slice(0, 10);
	const filename = originalPath.split('/').pop() || 'nota.md';
	return `_Conflitos/${stamp}/${filename}`;
}

interface LegacyEntry {
	path: string;
	guid: string;
}

function reportContent(summary: ObsidianSyncSummary, legacy: LegacyEntry[], dupes: string[]): string {
	const lines = [
		'---',
		'tipo: relatorio-sync',
		`gerado: "${new Date().toISOString()}"`,
		'tags: [tipo/relatorio]',
		'---',
		'',
		'# Sincronização JW Library',
		'',
		`- Criadas: ${summary.created}`,
		`- Atualizadas (FM canônico): ${summary.updated}`,
		`- Sem mudanças: ${summary.unchanged}`,
		`- Conflitos: ${summary.conflicts}`,
		`- Legado V1 (jw_guid) intocado: ${summary.legacySkipped}`,
		`- Apoio criado (atomic verses, MOCs): ${summary.supportCreated}`,
		''
	];
	if (legacy.length) {
		lines.push('## Notas legadas (V1) preservadas', '');
		for (const e of legacy) lines.push(`- \`${e.path}\` — guid \`${e.guid}\``);
		lines.push('', 'Para migrar: re-exporte o ZIP V2 ou ajuste manualmente o frontmatter.', '');
	}
	if (dupes.length) {
		lines.push('## note-guid duplicados no vault', '');
		for (const g of dupes) lines.push(`- \`${g}\``);
		lines.push('');
	}
	return lines.join('\n');
}

// ─────────────────────────── Main ───────────────────────────

export async function syncObsidianVault(
	root: FileSystemDirectoryHandle,
	vault: ObsidianVaultFiles
): Promise<ObsidianSyncSummary> {
	const existing = await collectMarkdown(root);
	const byGuid = new Map<string, ExistingNote>();
	const byPath = new Map<string, ExistingNote>();
	const dupes = new Set<string>();
	const legacy: LegacyEntry[] = [];

	for (const file of existing) {
		byPath.set(file.path, file);
		const { kind, guid } = extractGuid(file.content);
		if (!guid) continue;
		if (kind === 'v1') {
			legacy.push({ path: file.path, guid });
			continue;
		}
		if (byGuid.has(guid)) {
			dupes.add(guid);
			continue;
		}
		byGuid.set(guid, file);
	}

	const summary: ObsidianSyncSummary = {
		created: 0,
		updated: 0,
		unchanged: 0,
		conflicts: 0,
		legacySkipped: legacy.length,
		supportCreated: 0,
		reportPath: ''
	};

	const notePathSet = new Set(vault.notePaths);

	// ─── Notas pessoais (Bíblia + Publicações) ───
	for (const path of vault.notePaths) {
		const generated = vault.files[path];
		const { guid } = extractGuid(generated);
		const target = guid ? byGuid.get(guid) : null;

		if (dupes.has(guid ?? '')) {
			await writeText(root, conflictPath(path), generated);
			summary.conflicts++;
			continue;
		}

		if (!target) {
			await writeText(root, path, generated);
			summary.created++;
			continue;
		}

		const result = patchExisting(target.content, generated);
		if (!result) {
			await writeText(root, conflictPath(path), generated);
			summary.conflicts++;
			continue;
		}
		if (result.changed) {
			await writeTextHandle(target.handle, result.content);
			summary.updated++;
		} else {
			summary.unchanged++;
		}
	}

	// ─── Apoio: atomic verses + MOCs (match por path) ───
	for (const [path, content] of Object.entries(vault.files)) {
		if (notePathSet.has(path)) continue; // já tratado acima
		if (path === 'Espiritual.md') continue; // home nunca tocado
		const target = byPath.get(path);
		if (!target) {
			await writeText(root, path, content);
			summary.supportCreated++;
			continue;
		}
		const result = patchExisting(target.content, content);
		if (!result) {
			await writeText(root, conflictPath(path), content);
			summary.conflicts++;
			continue;
		}
		if (result.changed) {
			await writeTextHandle(target.handle, result.content);
			summary.updated++;
		} else {
			summary.unchanged++;
		}
	}

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	summary.reportPath = `_Relatorios/sync-${stamp}.md`;
	await writeText(root, summary.reportPath, reportContent(summary, legacy, [...dupes]));
	return summary;
}

/**
 * Aplica patch auto-managed do FM gerado sobre o conteúdo existente.
 * Body intocado. Retorna null se parse falhar (caller trata como conflict).
 */
function patchExisting(
	existingContent: string,
	generatedContent: string
): { content: string; changed: boolean } | null {
	const existing = parseDocument(existingContent);
	const generated = parseDocument(generatedContent);
	if (!existing.valid || !generated.valid) return null;

	const tipo = pickSyncTipo(existing.fmLines, generated.fmLines);
	if (!tipo) return { content: existingContent, changed: false };

	const autoFields = SYNC_AUTO_MANAGED_FIELDS[tipo];
	if (autoFields.length === 0) return { content: existingContent, changed: false };

	const { merged, changed } = mergeAutoManaged(existing.fmLines, generated.fmLines, autoFields);
	if (!changed) return { content: existingContent, changed: false };
	return { content: rebuildContent(merged, existing.body), changed: true };
}

function pickSyncTipo(existingFm: string[], generatedFm: string[]): SyncTipo | null {
	// Prioriza tipo do gerado (autoritativo); cai pro existente se gerado mudou.
	const gen = syncTipoFromFm(fmFieldsMap(generatedFm));
	if (gen) return gen;
	return syncTipoFromFm(fmFieldsMap(existingFm));
}
