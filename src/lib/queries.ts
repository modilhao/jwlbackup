import type { Database } from 'sql.js';
import type { Counts, Note, Bookmark, Tag, UserMark, Location, PlaylistItem } from './types';

export function getCounts(db: Database): Counts {
	const q = (sql: string) => {
		const r = db.exec(sql);
		return r[0] ? Number(r[0].values[0][0]) : 0;
	};
	return {
		notes: q('SELECT COUNT(*) FROM Note'),
		userMarks: q('SELECT COUNT(*) FROM UserMark'),
		bookmarks: q('SELECT COUNT(*) FROM Bookmark'),
		tags: q('SELECT COUNT(*) FROM Tag'),
		tagMaps: q('SELECT COUNT(*) FROM TagMap'),
		playlistItems: q('SELECT COUNT(*) FROM PlaylistItem'),
		locations: q('SELECT COUNT(*) FROM Location'),
		inputFields: q('SELECT COUNT(*) FROM InputField'),
		independentMedia: q('SELECT COUNT(*) FROM IndependentMedia')
	};
}

function rowsToObjects<T>(db: Database, sql: string, params: unknown[] = []): T[] {
	const stmt = db.prepare(sql);
	stmt.bind(params as never);
	const out: T[] = [];
	while (stmt.step()) out.push(stmt.getAsObject() as T);
	stmt.free();
	return out;
}

export function listNotes(db: Database, opts: { search?: string; limit?: number; offset?: number } = {}): Note[] {
	const limit = opts.limit ?? 200;
	const offset = opts.offset ?? 0;
	if (opts.search) {
		const like = `%${opts.search}%`;
		return rowsToObjects<Note>(
			db,
			'SELECT * FROM Note WHERE Title LIKE ? OR Content LIKE ? ORDER BY LastModified DESC LIMIT ? OFFSET ?',
			[like, like, limit, offset]
		);
	}
	return rowsToObjects<Note>(db, 'SELECT * FROM Note ORDER BY LastModified DESC LIMIT ? OFFSET ?', [
		limit,
		offset
	]);
}

export function getNote(db: Database, id: number): Note | null {
	const r = rowsToObjects<Note>(db, 'SELECT * FROM Note WHERE NoteId = ?', [id]);
	return r[0] ?? null;
}

export function updateNote(db: Database, id: number, title: string, content: string): void {
	db.run(
		"UPDATE Note SET Title = ?, Content = ?, LastModified = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE NoteId = ?",
		[title, content, id]
	);
}

export function deleteNote(db: Database, id: number): void {
	db.run('DELETE FROM TagMap WHERE NoteId = ?', [id]);
	db.run('DELETE FROM Note WHERE NoteId = ?', [id]);
}

export function listBookmarks(db: Database): Bookmark[] {
	return rowsToObjects<Bookmark>(db, 'SELECT * FROM Bookmark ORDER BY Slot');
}

export function deleteBookmark(db: Database, id: number): void {
	db.run('DELETE FROM Bookmark WHERE BookmarkId = ?', [id]);
}

export function listTags(db: Database): Tag[] {
	return rowsToObjects<Tag>(db, 'SELECT * FROM Tag ORDER BY Type, Name');
}

export function renameTag(db: Database, id: number, name: string): void {
	db.run('UPDATE Tag SET Name = ? WHERE TagId = ?', [name, id]);
}

export function deleteTag(db: Database, id: number): void {
	db.run('DELETE FROM TagMap WHERE TagId = ?', [id]);
	db.run('DELETE FROM Tag WHERE TagId = ?', [id]);
}

export function listUserMarks(db: Database, limit = 200, offset = 0): UserMark[] {
	return rowsToObjects<UserMark>(db, 'SELECT * FROM UserMark ORDER BY UserMarkId DESC LIMIT ? OFFSET ?', [
		limit,
		offset
	]);
}

export function listLocations(db: Database, limit = 200, offset = 0): Location[] {
	return rowsToObjects<Location>(
		db,
		'SELECT * FROM Location ORDER BY LocationId DESC LIMIT ? OFFSET ?',
		[limit, offset]
	);
}

export function listPlaylistItems(db: Database): PlaylistItem[] {
	return rowsToObjects<PlaylistItem>(db, 'SELECT * FROM PlaylistItem ORDER BY PlaylistItemId DESC');
}

export function getLocationLabel(db: Database, id: number | null): string {
	if (id == null) return '—';
	const r = rowsToObjects<Location>(db, 'SELECT * FROM Location WHERE LocationId = ?', [id]);
	const loc = r[0];
	if (!loc) return `#${id}`;
	if (loc.Title) return loc.Title;
	const parts: string[] = [];
	if (loc.KeySymbol) parts.push(loc.KeySymbol);
	if (loc.BookNumber) parts.push(`bk ${loc.BookNumber}`);
	if (loc.ChapterNumber) parts.push(`ch ${loc.ChapterNumber}`);
	if (loc.DocumentId) parts.push(`doc ${loc.DocumentId}`);
	return parts.join(' · ') || `#${id}`;
}

export function cleanupOrphans(db: Database): { removed: number } {
	let removed = 0;
	const before = db.exec('SELECT COUNT(*) FROM UserMark WHERE LocationId NOT IN (SELECT LocationId FROM Location)');
	if (before[0]) removed += Number(before[0].values[0][0]);
	db.run('DELETE FROM BlockRange WHERE UserMarkId NOT IN (SELECT UserMarkId FROM UserMark)');
	db.run('DELETE FROM UserMark WHERE LocationId NOT IN (SELECT LocationId FROM Location)');
	db.run('DELETE FROM Note WHERE UserMarkId IS NOT NULL AND UserMarkId NOT IN (SELECT UserMarkId FROM UserMark)');
	db.run('DELETE FROM TagMap WHERE NoteId IS NOT NULL AND NoteId NOT IN (SELECT NoteId FROM Note)');
	return { removed };
}
