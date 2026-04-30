export interface Manifest {
	name: string;
	creationDate: string;
	version: number;
	type: number;
	userDataBackup: {
		databaseName: string;
		lastModifiedDate: string;
		hash: string;
		deviceName: string;
		schemaVersion: number;
	};
}

export interface Note {
	NoteId: number;
	Guid: string;
	UserMarkId: number | null;
	LocationId: number | null;
	Title: string | null;
	Content: string | null;
	LastModified: string;
	Created: string;
	BlockType: number;
	BlockIdentifier: number | null;
}

export interface Bookmark {
	BookmarkId: number;
	LocationId: number;
	PublicationLocationId: number;
	Slot: number;
	Title: string;
	Snippet: string | null;
	BlockType: number;
	BlockIdentifier: number | null;
}

export interface Tag {
	TagId: number;
	Type: number;
	Name: string;
}

export interface UserMark {
	UserMarkId: number;
	ColorIndex: number;
	LocationId: number;
	StyleIndex: number;
	UserMarkGuid: string;
	Version: number;
}

export interface Location {
	LocationId: number;
	BookNumber: number | null;
	ChapterNumber: number | null;
	DocumentId: number | null;
	Track: number | null;
	IssueTagNumber: number;
	KeySymbol: string | null;
	MepsLanguage: number | null;
	Type: number;
	Title: string | null;
}

export interface PlaylistItem {
	PlaylistItemId: number;
	Label: string;
	StartTrimOffsetTicks: number | null;
	EndTrimOffsetTicks: number | null;
	Accuracy: number;
	EndAction: number;
	ThumbnailFilePath: string | null;
}

export interface Counts {
	notes: number;
	userMarks: number;
	bookmarks: number;
	tags: number;
	tagMaps: number;
	playlistItems: number;
	locations: number;
	inputFields: number;
	independentMedia: number;
}
