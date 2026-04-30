import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js/dist/sql-wasm.js';
import { base } from '$app/paths';
import type { Manifest } from './types';

let sqlJs: SqlJsStatic | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
	if (sqlJs) return sqlJs;
	sqlJs = await initSqlJs({
		locateFile: () => `${base}/sql-wasm.wasm`
	});
	return sqlJs;
}

export interface JwlArchive {
	manifest: Manifest;
	db: Database;
	files: Record<string, Uint8Array>;
	originalName: string;
}

export async function openJwlibrary(file: File): Promise<JwlArchive> {
	const buf = new Uint8Array(await file.arrayBuffer());
	const entries = unzipSync(buf);

	const manifestRaw = entries['manifest.json'];
	if (!manifestRaw) throw new Error('manifest.json não encontrado');
	const manifest: Manifest = JSON.parse(strFromU8(manifestRaw));

	const dbName = manifest.userDataBackup.databaseName;
	const dbBytes = entries[dbName];
	if (!dbBytes) throw new Error(`${dbName} não encontrado`);

	const SQL = await loadSqlJs();
	const db = new SQL.Database(dbBytes);

	return { manifest, db, files: entries, originalName: file.name };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	const hash = await crypto.subtle.digest('SHA-256', buffer);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function packJwlibrary(archive: JwlArchive): Promise<Blob> {
	const dbBytes = archive.db.export();
	const hash = await sha256Hex(dbBytes);

	const now = new Date();
	const isoLocal = formatLocalIso(now);

	const newManifest: Manifest = {
		...archive.manifest,
		creationDate: isoLocal,
		userDataBackup: {
			...archive.manifest.userDataBackup,
			lastModifiedDate: isoLocal,
			hash
		}
	};

	const out: Record<string, Uint8Array> = {};
	for (const [name, bytes] of Object.entries(archive.files)) {
		if (name === 'manifest.json' || name === archive.manifest.userDataBackup.databaseName) continue;
		out[name] = bytes;
	}
	out['manifest.json'] = strToU8(JSON.stringify(newManifest));
	out[archive.manifest.userDataBackup.databaseName] = dbBytes;

	const zipped = zipSync(out, { level: 6 });
	return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

function formatLocalIso(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	const tzMin = -d.getTimezoneOffset();
	const sign = tzMin >= 0 ? '+' : '-';
	const tzH = pad(Math.floor(Math.abs(tzMin) / 60));
	const tzM = pad(Math.abs(tzMin) % 60);
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${tzH}${tzM}`
	);
}

export function makeBackupName(deviceName: string): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	return `UserdataBackup_${stamp}_${deviceName}.jwlibrary`;
}

export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
