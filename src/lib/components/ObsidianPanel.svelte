<script lang="ts">
	import { onMount } from 'svelte';
	import { archiveStore } from '$lib/store.svelte';
	import { downloadBlob } from '$lib/jwlibrary';
	import {
		buildObsidianVaultFiles,
		exportObsidianVault,
		type ObsidianExportSummary
	} from '$lib/obsidian/exporter';
	import {
		pickDirectory,
		supportsDirectorySync,
		syncObsidianVault,
		type ObsidianSyncSummary
	} from '$lib/obsidian/sync';

	let exporting = $state(false);
	let syncing = $state(false);
	let canSyncDirectory = $state(false);
	let lastSummary = $state<ObsidianExportSummary | null>(null);
	let syncSummary = $state<ObsidianSyncSummary | null>(null);
	let syncError = $state<string | null>(null);

	onMount(() => {
		canSyncDirectory = supportsDirectorySync();
	});

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

	async function syncVault() {
		const db = archiveStore.current?.db;
		if (!db) return;
		syncing = true;
		syncError = null;
		try {
			const directory = await pickDirectory();
			const files = buildObsidianVaultFiles(db);
			syncSummary = await syncObsidianVault(directory, files);
			lastSummary = files.summary;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			syncError = error instanceof Error ? error.message : 'Não foi possível atualizar a pasta.';
		} finally {
			syncing = false;
		}
	}
</script>

<section class="flex-1 overflow-y-auto">
	<div class="max-w-4xl mx-auto px-8 py-10 space-y-8">
		<div>
			<p class="text-sm font-medium mb-2" style:color="var(--color-coral)">Exportação Obsidian</p>
			<h1 class="serif text-3xl font-medium">Vault estruturado</h1>
			<p class="mt-3 text-ink-muted leading-relaxed max-w-2xl">
				Gera notas com identidade estável do JW Library, bloco controlado para sincronização e áreas
				livres para edição dentro do Obsidian.
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
				<div class="text-sm text-ink-muted">Controle</div>
				<div class="text-2xl font-medium mt-1">jw_guid</div>
			</div>
		</div>

		<div class="card p-5 space-y-4">
			<div>
				<h2 class="font-medium text-lg">Exportar como ZIP</h2>
				<ul class="mt-3 space-y-2 text-sm text-ink-soft">
					<li><code>JW Library/Notas/</code> com frontmatter YAML para Dataview.</li>
					<li><code>JWL:BEGIN</code> e <code>JWL:END</code> delimitam a área controlada pela fonte.</li>
					<li><code>jw_guid</code>, <code>jw_source_modified</code> e <code>jw_content_hash</code> identificam cada nota.</li>
					<li><code>Bíblia/</code>, <code>JW Library/MOCs/</code>, <code>Templates/</code> e <code>Espiritual.md</code> acompanham o pacote.</li>
				</ul>
			</div>

			<div class="divider"></div>

			<div class="flex items-center justify-between gap-4">
				<p class="text-sm text-ink-muted">
					Use este modo para criar um vault novo ou revisar os arquivos antes de copiar para o Obsidian.
				</p>
				<button class="btn btn-primary shrink-0" onclick={exportVault} disabled={exporting}>
					{exporting ? 'Exportando…' : 'Baixar ZIP Obsidian'}
				</button>
			</div>
		</div>

		<div class="card p-5 space-y-4">
			<div>
				<h2 class="font-medium text-lg">Atualizar vault existente</h2>
				<p class="mt-2 text-sm text-ink-muted leading-relaxed">
					Lê a pasta escolhida, encontra notas por <code>jw_guid</code> e atualiza somente o bloco
					controlado. Texto fora de <code>JWL:BEGIN</code>/<code>JWL:END</code> é preservado. Se uma
					nota antiga não tiver marcadores, o app cria um arquivo em <code>JW Library/Conflitos</code>.
				</p>
			</div>

			<div class="divider"></div>

			<div class="flex items-center justify-between gap-4">
				<p class="text-sm text-ink-muted">
					{canSyncDirectory
						? 'Escolha a raiz do vault Obsidian para aplicar a sincronização segura.'
						: 'Seu navegador atual não expõe seleção de pasta. Use o ZIP neste ambiente.'}
				</p>
				<button class="btn btn-outline shrink-0" onclick={syncVault} disabled={syncing || !canSyncDirectory}>
					{syncing ? 'Atualizando…' : 'Atualizar pasta'}
				</button>
			</div>
		</div>

		{#if syncError}
			<div class="card p-4 text-sm" style="border-color:var(--color-danger);color:var(--color-danger);">
				{syncError}
			</div>
		{/if}

		{#if syncSummary}
			<div class="card p-5">
				<h2 class="font-medium text-lg">Última sincronização</h2>
				<div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-sm">
					<div>
						<div class="text-ink-muted">Criadas</div>
						<div class="text-xl font-medium">{syncSummary.created.toLocaleString('pt-BR')}</div>
					</div>
					<div>
						<div class="text-ink-muted">Atualizadas</div>
						<div class="text-xl font-medium">{syncSummary.updated.toLocaleString('pt-BR')}</div>
					</div>
					<div>
						<div class="text-ink-muted">Iguais</div>
						<div class="text-xl font-medium">{syncSummary.unchanged.toLocaleString('pt-BR')}</div>
					</div>
					<div>
						<div class="text-ink-muted">Conflitos</div>
						<div class="text-xl font-medium">{syncSummary.conflicts.toLocaleString('pt-BR')}</div>
					</div>
					<div>
						<div class="text-ink-muted">Apoio</div>
						<div class="text-xl font-medium">{syncSummary.supportCreated.toLocaleString('pt-BR')}</div>
					</div>
				</div>
				<p class="mt-4 text-xs text-ink-muted">Relatório: <code>{syncSummary.reportPath}</code></p>
			</div>
		{/if}

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
