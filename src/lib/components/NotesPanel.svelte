<script lang="ts">
	import { archiveStore } from '$lib/store.svelte';
	import { listNotes, getNote, updateNote, deleteNote } from '$lib/queries';
	import { resolveRef } from '$lib/refs';
	import { exportNotesToZip, noteToMarkdown } from '$lib/markdown';
	import { downloadBlob } from '$lib/jwlibrary';
	import type { Note } from '$lib/types';
	import type { NoteRef } from '$lib/refs';

	let search = $state('');
	let selectedId = $state<number | null>(null);
	let editing = $state(false);
	let draftTitle = $state('');
	let draftContent = $state('');
	let refresh = $state(0);
	let exportOpen = $state(false);
	let folderByYear = $state(false);
	let shareStatus = $state<'idle' | 'copied' | 'shared'>('idle');

	const notes = $derived.by<Note[]>(() => {
		void refresh;
		const db = archiveStore.current?.db;
		if (!db) return [];
		return listNotes(db, { search: search || undefined, limit: 1000 });
	});

	function refOf(note: Note): NoteRef {
		const db = archiveStore.current!.db;
		return resolveRef(db, note);
	}

	const selected = $derived.by<Note | null>(() => {
		void refresh;
		const db = archiveStore.current?.db;
		if (!db || selectedId == null) return null;
		return getNote(db, selectedId);
	});

	const selectedRef = $derived.by<NoteRef | null>(() => {
		const db = archiveStore.current?.db;
		if (!db || !selected) return null;
		return resolveRef(db, selected);
	});

	function select(id: number) {
		selectedId = id;
		editing = false;
		shareStatus = 'idle';
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

	function exportSingle() {
		const db = archiveStore.current?.db;
		if (!db || !selected) return;
		const md = noteToMarkdown(db, selected, { folderByYear: false });
		const blob = new Blob([md.content], { type: 'text/markdown' });
		downloadBlob(blob, md.filename);
	}

	function shareText(): string {
		if (!selected || !selectedRef) return '';
		const title = selected.Title?.trim() || '(sem título)';
		return [
			title,
			selectedRef.display,
			'',
			selected.Content?.trim() || '',
			'',
			'Exportado do JWLBackup'
		]
			.filter((line, index, lines) => line || lines[index - 1])
			.join('\n');
	}

	async function shareSelected() {
		if (!selected || !selectedRef) return;
		const title = selected.Title?.trim() || selectedRef.display;
		const text = shareText();

		try {
			if (navigator.share) {
				await navigator.share({ title, text });
				shareStatus = 'shared';
			} else {
				await navigator.clipboard.writeText(text);
				shareStatus = 'copied';
			}
			setTimeout(() => (shareStatus = 'idle'), 2200);
		} catch {
			shareStatus = 'idle';
		}
	}

	function exportFiltered() {
		const db = archiveStore.current?.db;
		if (!db || notes.length === 0) return;
		const blob = exportNotesToZip(db, notes, { folderByYear });
		const stamp = new Date().toISOString().slice(0, 10);
		const suffix = search ? `-busca` : `-todas`;
		downloadBlob(blob, `JWLBackup-Notas${suffix}-${stamp}.zip`);
		exportOpen = false;
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
	<div class="w-[28rem] shrink-0 border-r border-line flex flex-col">
		<div class="p-3 border-b border-line space-y-2">
			<input
				class="input"
				type="search"
				placeholder="Buscar notas…"
				bind:value={search}
			/>
			<div class="flex items-center justify-between text-xs text-ink-muted">
				<span>{notes.length.toLocaleString('pt-BR')} {notes.length === 1 ? 'nota' : 'notas'}</span>
				<button class="btn-link" onclick={() => (exportOpen = !exportOpen)}>
					{exportOpen ? 'Cancelar' : 'Exportar Markdown ↓'}
				</button>
			</div>
			{#if exportOpen}
				<div class="card p-3 space-y-3 text-sm">
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="checkbox" bind:checked={folderByYear} />
						<span>Organizar em pastas por ano</span>
					</label>
					<button class="btn btn-primary w-full" onclick={exportFiltered}>
						Exportar {notes.length} {notes.length === 1 ? 'nota' : 'notas'} (.zip)
					</button>
					<p class="text-xs text-ink-muted">
						{search
							? 'Exporta apenas as notas filtradas pela busca.'
							: 'Exporta todas as notas. Cada nota vira um .md com referência (ex: Apocalipse 21:3-4).'}
					</p>
				</div>
			{/if}
		</div>
		<div class="flex-1 overflow-y-auto">
			{#each notes as note (note.NoteId)}
				{@const r = refOf(note)}
				<button
					class="note-item"
					class:active={selectedId === note.NoteId}
					onclick={() => select(note.NoteId)}
				>
					<div class="text-xs font-medium" style:color="var(--color-coral)">{r.display}</div>
					<div class="font-medium text-ink truncate mt-0.5">
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
		{#if selected && selectedRef}
			<div class="max-w-3xl mx-auto px-8 py-10">
				<div class="text-sm font-medium mb-2" style:color="var(--color-coral)">
					{selectedRef.display}
					{#if selectedRef.source && selectedRef.source !== 'Bíblia'}
						<span class="text-ink-muted font-normal">— {selectedRef.source}</span>
					{/if}
				</div>

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
					<div class="flex items-start gap-3 mb-2">
						<h1 class="serif text-3xl font-medium flex-1">
							{selected.Title || '(sem título)'}
						</h1>
						<button class="btn btn-outline" onclick={shareSelected} title="Compartilhar nota">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="18" cy="5" r="3" />
								<circle cx="6" cy="12" r="3" />
								<circle cx="18" cy="19" r="3" />
								<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
								<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
							</svg>
							<span>{shareStatus === 'copied' ? 'Copiado' : shareStatus === 'shared' ? 'Enviado' : 'Compartilhar'}</span>
						</button>
						<button class="btn btn-outline" onclick={exportSingle} title="Exportar para Markdown">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
							</svg>
							<span>.md</span>
						</button>
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
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.btn-link {
		color: var(--color-coral);
		font-weight: 500;
	}
	.btn-link:hover {
		text-decoration: underline;
	}
</style>
