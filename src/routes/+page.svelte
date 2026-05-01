<script lang="ts">
	import Dropzone from '$lib/components/Dropzone.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import NotesPanel from '$lib/components/NotesPanel.svelte';
	import SimpleListPanel from '$lib/components/SimpleListPanel.svelte';
	import MaintenancePanel from '$lib/components/MaintenancePanel.svelte';
	import ObsidianPanel from '$lib/components/ObsidianPanel.svelte';
	import { archiveStore } from '$lib/store.svelte';
	import {
		getCounts,
		listBookmarks,
		listTags,
		listUserMarks,
		listLocations,
		listPlaylistItems,
		getLocationLabel
	} from '$lib/queries';

	type Tab = 'notes' | 'obsidian' | 'highlights' | 'bookmarks' | 'tags' | 'playlists' | 'locations' | 'media' | 'maintenance';

	let tab = $state<Tab>('notes');

	const counts = $derived.by(() => {
		const db = archiveStore.current?.db;
		return db
			? getCounts(db)
			: {
					notes: 0,
					userMarks: 0,
					bookmarks: 0,
					tags: 0,
					tagMaps: 0,
					playlistItems: 0,
					locations: 0,
					inputFields: 0,
					independentMedia: 0
				};
	});

	const bookmarks = $derived.by(() => {
		const db = archiveStore.current?.db;
		if (!db) return [];
		return listBookmarks(db).map((b) => ({
			Slot: b.Slot,
			Title: b.Title,
			Local: getLocationLabel(db, b.LocationId),
			Snippet: b.Snippet ?? ''
		}));
	});

	const tags = $derived.by(() => {
		const db = archiveStore.current?.db;
		if (!db) return [];
		return listTags(db).map((t) => ({
			Tipo: ['Categoria', 'Etiqueta', 'Playlist'][t.Type] ?? t.Type,
			Nome: t.Name
		}));
	});

	const highlights = $derived.by(() => {
		const db = archiveStore.current?.db;
		if (!db) return [];
		return listUserMarks(db, 500).map((u) => ({
			ID: u.UserMarkId,
			Cor: u.ColorIndex,
			Estilo: u.StyleIndex,
			Local: getLocationLabel(db, u.LocationId)
		}));
	});

	const locations = $derived.by(() => {
		const db = archiveStore.current?.db;
		if (!db) return [];
		return listLocations(db, 500).map((l) => ({
			ID: l.LocationId,
			Tipo: l.Type,
			Símbolo: l.KeySymbol ?? '',
			Livro: l.BookNumber ?? '',
			Cap: l.ChapterNumber ?? '',
			Doc: l.DocumentId ?? '',
			Título: l.Title ?? ''
		}));
	});

	const playlists = $derived.by(() => {
		const db = archiveStore.current?.db;
		if (!db) return [];
		return listPlaylistItems(db).map((p) => ({
			ID: p.PlaylistItemId,
			Label: p.Label,
			Accuracy: p.Accuracy
		}));
	});
</script>

{#if !archiveStore.current}
	<main class="min-h-screen">
		<Dropzone />
	</main>
{:else}
	<div class="h-screen flex flex-col">
		<TopBar />
		<div class="flex flex-1 min-h-0">
			<Sidebar bind:current={tab} {counts} />
			<main class="flex-1 flex flex-col min-w-0">
				{#if tab === 'notes'}
					<NotesPanel />
				{:else if tab === 'obsidian'}
					<ObsidianPanel />
				{:else if tab === 'bookmarks'}
					<SimpleListPanel
						title="Favoritos"
						columns={[
							{ key: 'Slot', label: 'Slot', width: '5rem' },
							{ key: 'Title', label: 'Título' },
							{ key: 'Local', label: 'Local' },
							{ key: 'Snippet', label: 'Trecho' }
						]}
						rows={bookmarks}
					/>
				{:else if tab === 'tags'}
					<SimpleListPanel
						title="Etiquetas"
						columns={[
							{ key: 'Tipo', label: 'Tipo', width: '8rem' },
							{ key: 'Nome', label: 'Nome' }
						]}
						rows={tags}
					/>
				{:else if tab === 'highlights'}
					<SimpleListPanel
						title="Marcações"
						columns={[
							{ key: 'ID', label: 'ID', width: '6rem' },
							{ key: 'Cor', label: 'Cor', width: '5rem' },
							{ key: 'Estilo', label: 'Estilo', width: '5rem' },
							{ key: 'Local', label: 'Local' }
						]}
						rows={highlights}
					/>
				{:else if tab === 'locations'}
					<SimpleListPanel
						title="Localizações"
						columns={[
							{ key: 'ID', label: 'ID', width: '5rem' },
							{ key: 'Tipo', label: 'Tipo', width: '4rem' },
							{ key: 'Símbolo', label: 'Símbolo', width: '7rem' },
							{ key: 'Livro', label: 'Livro', width: '4rem' },
							{ key: 'Cap', label: 'Cap', width: '4rem' },
							{ key: 'Doc', label: 'Doc', width: '6rem' },
							{ key: 'Título', label: 'Título' }
						]}
						rows={locations}
					/>
				{:else if tab === 'playlists'}
					<SimpleListPanel
						title="Playlists"
						columns={[
							{ key: 'ID', label: 'ID', width: '5rem' },
							{ key: 'Label', label: 'Nome' },
							{ key: 'Accuracy', label: 'Precisão', width: '7rem' }
						]}
						rows={playlists}
					/>
				{:else if tab === 'media'}
					<SimpleListPanel
						title="Mídia independente"
						columns={[{ key: 'TODO', label: 'Em breve' }]}
						rows={[]}
						empty="Visualização de mídia chega na v0.2."
					/>
				{:else if tab === 'maintenance'}
					<MaintenancePanel />
				{/if}
			</main>
		</div>
	</div>
{/if}
