<script lang="ts">
	import { openJwlibrary } from '$lib/jwlibrary';
	import { archiveStore } from '$lib/store.svelte';

	let dragging = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function handleFile(file: File) {
		loading = true;
		error = null;
		try {
			const archive = await openJwlibrary(file);
			archiveStore.open(archive);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erro ao abrir arquivo';
		} finally {
			loading = false;
		}
	}

	function onChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) handleFile(file);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) handleFile(file);
	}
</script>

<div class="mx-auto max-w-2xl px-6 py-16">
	<div class="text-center mb-10">
		<h1 class="serif text-5xl tracking-tight mb-4">Seus backups, do seu jeito.</h1>
		<p class="text-ink-muted text-lg max-w-lg mx-auto">
			Abra, edite e organize seu backup do JW Library — tudo direto no navegador. Privado, local,
			open source.
		</p>
	</div>

	<label
		class="block cursor-pointer transition-all"
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
	>
		<div
			class="card flex flex-col items-center justify-center gap-3 px-8 py-16 border-dashed transition-all"
			class:dragging
		>
			{#if loading}
				<svg class="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none">
					<circle cx="12" cy="12" r="10" stroke="var(--color-line)" stroke-width="3" />
					<path d="M22 12a10 10 0 0 1-10 10" stroke="var(--color-coral)" stroke-width="3" stroke-linecap="round" />
				</svg>
				<p class="text-ink-soft">Abrindo backup…</p>
			{:else}
				<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-coral)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<p class="text-ink font-medium">Arraste seu arquivo <span class="font-mono text-sm">.jwlibrary</span> aqui</p>
				<p class="text-ink-muted text-sm">ou clique para escolher</p>
			{/if}
		</div>
		<input type="file" accept=".jwlibrary" class="hidden" onchange={onChange} />
	</label>

	{#if error}
		<div class="mt-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
			{error}
		</div>
	{/if}

	<div class="mt-8 text-center text-sm text-ink-muted">
		<p>
			Nada sai do seu navegador. Sem servidor, sem upload, sem rastreamento.
		</p>
	</div>
</div>

<style>
	.dragging {
		border-color: var(--color-coral) !important;
		background: var(--color-coral-faint) !important;
	}
</style>
