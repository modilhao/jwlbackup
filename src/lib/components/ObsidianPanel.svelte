<script lang="ts">
	import { archiveStore } from '$lib/store.svelte';
	import { downloadBlob } from '$lib/jwlibrary';
	import { exportObsidianVault, type ObsidianExportSummary } from '$lib/obsidian/exporter';

	let exporting = $state(false);
	let lastSummary = $state<ObsidianExportSummary | null>(null);

	function exportVault() {
		const db = archiveStore.current?.db;
		if (!db) return;
		exporting = true;
		try {
			const result = exportObsidianVault(db);
			const stamp = new Date().toISOString().slice(0, 10);
			downloadBlob(result.blob, `JW-Library-Obsidian-${stamp}.zip`);
			lastSummary = result.summary;
		} finally {
			exporting = false;
		}
	}
</script>

<section class="flex-1 overflow-y-auto">
	<div class="max-w-4xl mx-auto px-8 py-10 space-y-8">
		<div>
			<p class="text-sm font-medium mb-2" style:color="var(--color-coral)">Exportação Obsidian</p>
			<h1 class="serif text-3xl font-medium">Vault estruturado</h1>
			<p class="mt-3 text-ink-muted leading-relaxed max-w-2xl">
				Gera um ZIP com notas pessoais, versículos atômicos, MOCs por etiqueta, template e home
				pronta para abrir no Obsidian.
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
			<div class="card p-4">
				<div class="text-sm text-ink-muted">Notas</div>
				<div class="text-2xl font-medium mt-1">JW Library/Notas</div>
			</div>
			<div class="card p-4">
				<div class="text-sm text-ink-muted">Bíblia</div>
				<div class="text-2xl font-medium mt-1">Versículos</div>
			</div>
			<div class="card p-4">
				<div class="text-sm text-ink-muted">Mapas</div>
				<div class="text-2xl font-medium mt-1">MOCs</div>
			</div>
		</div>

		<div class="card p-5 space-y-4">
			<div>
				<h2 class="font-medium text-lg">Conteúdo do ZIP</h2>
				<ul class="mt-3 space-y-2 text-sm text-ink-soft">
					<li><code>Espiritual.md</code> com resumo e notas recentes.</li>
					<li><code>JW Library/Notas/</code> com frontmatter YAML para Dataview.</li>
					<li><code>Bíblia/</code> com notas atômicas para versículos referenciados.</li>
					<li><code>JW Library/MOCs/</code> com uma página por etiqueta pessoal.</li>
					<li><code>Templates/</code> com template base de nota JW Library.</li>
				</ul>
			</div>

			<div class="divider"></div>

			<div class="flex items-center justify-between gap-4">
				<p class="text-sm text-ink-muted">
					Este MVP não altera nenhum vault existente. A reconciliação com notas antigas virá em uma etapa
					separada.
				</p>
				<button class="btn btn-primary shrink-0" onclick={exportVault} disabled={exporting}>
					{exporting ? 'Exportando…' : 'Baixar ZIP Obsidian'}
				</button>
			</div>
		</div>

		{#if lastSummary}
			<div class="card p-5">
				<h2 class="font-medium text-lg">Última exportação</h2>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
					<div>
						<div class="text-ink-muted">Notas pessoais</div>
						<div class="text-xl font-medium">{lastSummary.notes.toLocaleString('pt-BR')}</div>
					</div>
					<div>
						<div class="text-ink-muted">Versículos</div>
						<div class="text-xl font-medium">{lastSummary.verseNotes.toLocaleString('pt-BR')}</div>
					</div>
					<div>
						<div class="text-ink-muted">MOCs</div>
						<div class="text-xl font-medium">{lastSummary.tagMocs.toLocaleString('pt-BR')}</div>
					</div>
					<div>
						<div class="text-ink-muted">Arquivos</div>
						<div class="text-xl font-medium">{lastSummary.files.toLocaleString('pt-BR')}</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</section>
