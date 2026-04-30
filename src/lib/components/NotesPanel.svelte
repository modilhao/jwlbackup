<script lang="ts">
	import { archiveStore } from '$lib/store.svelte';
	import { listNotes, getNote, updateNote, deleteNote, getLocationLabel } from '$lib/queries';
	import type { Note } from '$lib/types';

	let search = $state('');
	let selectedId = $state<number | null>(null);
	let editing = $state(false);
	let draftTitle = $state('');
	let draftContent = $state('');
	let refresh = $state(0);

	const notes = $derived.by<Note[]>(() => {
		void refresh;
		const db = archiveStore.current?.db;
		if (!db) return [];
		return listNotes(db, { search: search || undefined, limit: 500 });
	});

	const selected = $derived.by<Note | null>(() => {
		void refresh;
		const db = archiveStore.current?.db;
		if (!db || selectedId == null) return null;
		return getNote(db, selectedId);
	});

	function select(id: number) {
		selectedId = id;
		editing = false;
	}

	function startEdit() {
		if (!selected) return;
		draftTitle = selected.Title ?? '';
		draftContent = selected.Content ?? '';
		editing = true;
	}

	function saveEdit() {
		const db = archiveStore.current?.db;
		if (!db || !selected) return;
		updateNote(db, selected.NoteId, draftTitle, draftContent);
		archiveStore.markDirty();
		editing = false;
		refresh++;
	}

	function remove() {
		const db = archiveStore.current?.db;
		if (!db || !selected) return;
		if (!confirm('Excluir esta nota?')) return;
		deleteNote(db, selected.NoteId);
		archiveStore.markDirty();
		selectedId = null;
		refresh++;
	}

	function fmt(iso: string): string {
		try {
			return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
		} catch {
			return iso;
		}
	}
</script>

<div class="flex flex-1 min-h-0">
	<div class="w-96 shrink-0 border-r border-line flex flex-col">
		<div class="p-3 border-b border-line">
			<input
				class="input"
				type="search"
				placeholder="Buscar notas…"
				bind:value={search}
			/>
		</div>
		<div class="flex-1 overflow-y-auto">
			{#each notes as note (note.NoteId)}
				<button
					class="note-item"
					class:active={selectedId === note.NoteId}
					onclick={() => select(note.NoteId)}
				>
					<div class="font-medium text-ink truncate">
						{note.Title || '(sem título)'}
					</div>
					{#if note.Content}
						<div class="text-sm text-ink-muted line-clamp-2 mt-0.5">{note.Content}</div>
					{/if}
					<div class="text-xs text-ink-faint mt-1">{fmt(note.LastModified)}</div>
				</button>
			{:else}
				<div class="p-8 text-center text-ink-muted text-sm">
					{search ? 'Nenhuma nota encontrada.' : 'Sem notas.'}
				</div>
			{/each}
		</div>
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if selected}
			<div class="max-w-3xl mx-auto px-8 py-10">
				{#if editing}
					<input class="input serif text-3xl font-medium mb-6" bind:value={draftTitle} placeholder="Título" />
					<textarea
						class="input min-h-96 leading-relaxed font-sans"
						bind:value={draftContent}
						placeholder="Conteúdo…"
					></textarea>
					<div class="flex gap-2 mt-4">
						<button class="btn btn-primary" onclick={saveEdit}>Salvar</button>
						<button class="btn btn-ghost" onclick={() => (editing = false)}>Cancelar</button>
					</div>
				{:else}
					<div class="flex items-start gap-4 mb-2">
						<h1 class="serif text-3xl font-medium flex-1">
							{selected.Title || '(sem título)'}
						</h1>
						<button class="btn btn-outline" onclick={startEdit}>Editar</button>
						<button class="btn btn-ghost" onclick={remove} title="Excluir">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							</svg>
						</button>
					</div>
					<div class="flex flex-wrap gap-2 mb-6 text-xs text-ink-muted">
						<span>Atualizado {fmt(selected.LastModified)}</span>
						<span>·</span>
						<span>Criado {fmt(selected.Created)}</span>
						{#if selected.LocationId != null && archiveStore.current}
							<span>·</span>
							<span>{getLocationLabel(archiveStore.current.db, selected.LocationId)}</span>
						{/if}
					</div>
					<div class="prose prose-stone max-w-none whitespace-pre-wrap leading-relaxed text-ink">
						{selected.Content || ''}
					</div>
				{/if}
			</div>
		{:else}
			<div class="h-full flex items-center justify-center text-ink-muted">
				Selecione uma nota.
			</div>
		{/if}
	</div>
</div>

<style>
	.note-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--color-line-soft);
		transition: background 0.12s ease;
	}
	.note-item:hover {
		background: var(--color-cream-100);
	}
	.note-item.active {
		background: var(--color-coral-faint);
	}
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
