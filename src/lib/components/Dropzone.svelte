<script lang="ts">
	import { openJwlibrary } from '$lib/jwlibrary';
	import { archiveStore } from '$lib/store.svelte';

	let dragging = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let copied = $state(false);

	const features = [
		'Veja notas, marcações, favoritos e etiquetas',
		'Exporte notas em Markdown ou um vault Obsidian estruturado',
		'Atualize um vault existente preservando suas edições',
		'Compartilhe notas individuais quando quiser'
	];

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

<div class="mx-auto max-w-5xl px-6 py-12 md:py-16">
	<div class="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
		<section class="space-y-7">
			<div>
				<p class="text-sm font-medium mb-3" style:color="var(--color-coral)">JW Library Backup</p>
				<h1 class="serif text-5xl tracking-tight mb-5">Suas anotações espirituais, organizadas com cuidado.</h1>
				<p class="text-ink-muted text-lg leading-relaxed max-w-2xl">
					Abra seu backup do JW Library, revise suas notas e exporte tudo para Markdown ou
					Obsidian com segurança. Tudo acontece no seu navegador.
				</p>
			</div>

			<div class="grid gap-3 sm:grid-cols-3">
				<div class="info-panel">
					<div class="step">1</div>
					<h2>Escolha o backup</h2>
					<p>Arraste ou selecione seu arquivo <span class="font-mono">.jwlibrary</span>.</p>
				</div>
				<div class="info-panel">
					<div class="step">2</div>
					<h2>Revise o conteúdo</h2>
					<p>Navegue por notas, referências, etiquetas e marcações.</p>
				</div>
				<div class="info-panel">
					<div class="step">3</div>
					<h2>Exporte ou sincronize</h2>
					<p>Crie Markdown, gere Obsidian ou atualize seu vault.</p>
				</div>
			</div>

			<div class="card p-5">
				<h2 class="font-medium text-lg mb-4">O que você pode fazer</h2>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each features as feature}
						<div class="feature-row">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
								<path d="M20 6 9 17l-5-5" />
							</svg>
							<span>{feature}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<section class="space-y-5">
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
					class="card flex min-h-[22rem] flex-col items-center justify-center gap-3 px-8 py-14 border-dashed transition-all text-center"
					class:dragging
				>
					{#if loading}
						<svg class="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none">
							<circle cx="12" cy="12" r="10" stroke="var(--color-line)" stroke-width="3" />
							<path d="M22 12a10 10 0 0 1-10 10" stroke="var(--color-coral)" stroke-width="3" stroke-linecap="round" />
						</svg>
						<p class="text-ink-soft">Abrindo backup…</p>
					{:else}
						<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--color-coral)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						<p class="text-ink font-medium text-lg">Arraste seu arquivo <span class="font-mono text-base">.jwlibrary</span> aqui</p>
						<p class="text-ink-muted text-sm">ou clique para escolher no computador</p>
					{/if}
				</div>
				<input type="file" accept=".jwlibrary" class="hidden" onchange={onChange} />
			</label>

			{#if error}
				<div class="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
					{error}
				</div>
			{/if}

			<div class="card p-4 text-sm text-ink-muted leading-relaxed">
				<strong class="text-ink-soft font-medium">Privado por padrão.</strong>
				Nada sai do seu navegador: sem upload, sem servidor e sem rastreamento.
			</div>

			<div class="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
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
		</section>
	</div>
</div>

<style>
	.dragging {
		border-color: var(--color-coral) !important;
		background: var(--color-coral-faint) !important;
	}
	.info-panel {
		background: var(--color-bg-card);
		border: 1px solid var(--color-line);
		border-radius: var(--radius-soft);
		padding: 1rem;
		box-shadow: var(--shadow-soft);
	}
	.info-panel h2 {
		font-family: var(--font-sans);
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0;
		margin: 0.75rem 0 0.35rem;
	}
	.info-panel p {
		color: var(--color-ink-muted);
		font-size: 0.875rem;
		line-height: 1.45;
	}
	.step {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 999px;
		background: var(--color-coral-faint);
		color: var(--color-coral);
		font-size: 0.85rem;
		font-weight: 700;
	}
	.feature-row {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		color: var(--color-ink-soft);
		font-size: 0.9375rem;
		line-height: 1.45;
	}
	.feature-row svg {
		flex: 0 0 auto;
		margin-top: 0.125rem;
		color: var(--color-success);
	}
</style>
