import type { ObsidianVaultFiles } from './exporter';

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
	supportCreated: number;
	reportPath: string;
}

interface ExistingNote {
	path: string;
	content: string;
	handle: FileSystemFileHandle;
}

const BEGIN = '<!-- JWL:BEGIN -->';
const END = '<!-- JWL:END -->';

export function supportsDirectorySync(): boolean {
	return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
	const picker = (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
	return picker();
}

function noteGuid(content: string): string | null {
	const match = content.match(/^jw_guid:\s*["']?([^"'\n]+)["']?\s*$/m);
	return match?.[1]?.trim() ?? null;
}

function controlledBlock(content: string): string | null {
	const start = content.indexOf(BEGIN);
	const end = content.indexOf(END);
	if (start === -1 || end === -1 || end < start) return null;
	return content.slice(start, end + END.length);
}

function replaceControlledBlock(existing: string, generated: string): string | null {
	const nextBlock = controlledBlock(generated);
	if (!nextBlock) return null;
	const start = existing.indexOf(BEGIN);
	const end = existing.indexOf(END);
	if (start === -1 || end === -1 || end < start) return null;
	return existing.slice(0, start) + nextBlock + existing.slice(end + END.length);
}

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

function guidFromGenerated(content: string): string | null {
	return noteGuid(content);
}

function conflictPath(originalPath: string): string {
	const stamp = new Date().toISOString().slice(0, 10);
	const filename = originalPath.split('/').pop() || 'nota.md';
	return `JW Library/Conflitos/${stamp}/${filename}`;
}

function reportContent(summary: ObsidianSyncSummary): string {
	return [
		'---',
		'tipo: relatorio-sincronizacao-jw-library',
		`gerado_em: "${new Date().toISOString()}"`,
		'tags: [jw-library, sincronizacao]',
		'---',
		'',
		'# Sincronização JW Library',
		'',
		`- Criadas: ${summary.created}`,
		`- Atualizadas: ${summary.updated}`,
		`- Sem mudanças: ${summary.unchanged}`,
		`- Conflitos: ${summary.conflicts}`,
		`- Arquivos de apoio criados: ${summary.supportCreated}`,
		''
	].join('\n');
}

export async function syncObsidianVault(root: FileSystemDirectoryHandle, vault: ObsidianVaultFiles): Promise<ObsidianSyncSummary> {
	const existing = await collectMarkdown(root);
	const byGuid = new Map<string, ExistingNote>();
	for (const file of existing) {
		const guid = noteGuid(file.content);
		if (guid && !byGuid.has(guid)) byGuid.set(guid, file);
	}

	const notePathSet = new Set(vault.notePaths);
	const summary: ObsidianSyncSummary = {
		created: 0,
		updated: 0,
		unchanged: 0,
		conflicts: 0,
		supportCreated: 0,
		reportPath: ''
	};

	for (const path of vault.notePaths) {
		const generated = vault.files[path];
		const guid = guidFromGenerated(generated);
		const target = guid ? byGuid.get(guid) : null;

		if (target) {
			const merged = replaceControlledBlock(target.content, generated);
			if (!merged) {
				await writeText(root, conflictPath(path), generated);
				summary.conflicts++;
			} else if (merged === target.content) {
				summary.unchanged++;
			} else {
				await writeText(root, target.path, merged);
				summary.updated++;
			}
		} else {
			await writeText(root, path, generated);
			summary.created++;
		}
	}

	for (const [path, content] of Object.entries(vault.files)) {
		if (notePathSet.has(path)) continue;
		if (await fileExists(root, path)) continue;
		await writeText(root, path, content);
		summary.supportCreated++;
	}

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	summary.reportPath = `JW Library/Relatorios/sincronizacao-${stamp}.md`;
	await writeText(root, summary.reportPath, reportContent(summary));
	return summary;
}
