import type { JwlArchive } from './jwlibrary';

class ArchiveStore {
	current = $state<JwlArchive | null>(null);
	dirty = $state(false);

	open(archive: JwlArchive) {
		this.current?.db.close();
		this.current = archive;
		this.dirty = false;
	}

	markDirty() {
		this.dirty = true;
	}

	close() {
		this.current?.db.close();
		this.current = null;
		this.dirty = false;
	}
}

export const archiveStore = new ArchiveStore();
