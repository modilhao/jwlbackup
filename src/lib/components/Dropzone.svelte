<script lang="ts">
	import { openJwlibrary } from '$lib/jwlibrary';
	import { archiveStore } from '$lib/store.svelte';

	let dragging = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let copied = $state(false);

	async function share() {
		const url = typeof location !== 'undefined' ? location.href : '';
		const text = 'JWLBackup — abra e organize seus backups do JW Library no navegador.';
		if (navigator.share) {
			try {
				await navigator.share({ title: 'JWLBackup', text, url });
				return;
			} catch {
				/* user cancelled */
			}
		}
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* ignore */
		}
	}

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

	<div class="mt-8 flex flex-col items-center gap-3 text-sm text-ink-muted">
		<p>Nada sai do seu navegador. Sem servidor, sem upload, sem rastreamento.</p>
		<div class="flex items-center gap-2">
			<button class="btn btn-outline" onclick={share}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="18" cy="5" r="3" />
					<circle cx="6" cy="12" r="3" />
					<circle cx="18" cy="19" r="3" />
					<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
					<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
				</svg>
				{copied ? 'Link copiado!' : 'Compartilhar com amigos'}
			</button>
			<a class="btn btn-ghost" href="https://github.com/modilhao/jwlbackup" target="_blank" rel="noopener">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
				</svg>
				Código no GitHub
			</a>
		</div>
	</div>
</div>

<style>
	.dragging {
		border-color: var(--color-coral) !important;
		background: var(--color-coral-faint) !important;
	}
</style>
