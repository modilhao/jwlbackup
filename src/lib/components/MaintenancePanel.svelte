<script lang="ts">
	import { archiveStore } from '$lib/store.svelte';
	import { cleanupOrphans, getCounts } from '$lib/queries';
	import type { Counts } from '$lib/types';

	let result = $state<string | null>(null);

	function runCleanup() {
		const db = archiveStore.current?.db;
		if (!db) return;
		if (!confirm('Remover registros órfãos (UserMarks sem Location, BlockRanges sem UserMark, etc)?')) return;
		const before = getCounts(db);
		cleanupOrphans(db);
		const after = getCounts(db);
		archiveStore.markDirty();
		result = formatDiff(before, after);
	}

	function vacuum() {
		const db = archiveStore.current?.db;
		if (!db) return;
		db.run('VACUUM');
		archiveStore.markDirty();
		result = 'VACUUM concluído. Banco compactado.';
	}

	function formatDiff(a: Counts, b: Counts): string {
		const keys: (keyof Counts)[] = ['notes', 'userMarks', 'bookmarks', 'tags', 'tagMaps', 'playlistItems', 'locations', 'inputFields', 'independentMedia'];
		const lines: string[] = [];
		for (const k of keys) {
			if (a[k] !== b[k]) lines.push(`${k}: ${a[k]} → ${b[k]} (−${a[k] - b[k]})`);
		}
		return lines.length ? lines.join('\n') : 'Nada removido — banco já estava limpo.';
	}
</script>

<div class="flex-1 overflow-y-auto">
	<div class="max-w-2xl mx-auto px-8 py-10">
		<h1 class="serif text-3xl font-medium mb-2">Manutenção</h1>
		<p class="text-ink-muted mb-8">Operações em todo o banco. Faça backup antes.</p>

		<div class="space-y-3">
			<div class="card p-5">
				<div class="flex items-start gap-4">
					<div class="flex-1">
						<h3 class="font-medium mb-1">Limpar órfãos</h3>
						<p class="text-sm text-ink-muted">
							Remove referências quebradas: marcações sem localização, intervalos sem marcação, etc.
						</p>
					</div>
					<button class="btn btn-outline" onclick={runCleanup}>Executar</button>
				</div>
			</div>

			<div class="card p-5">
				<div class="flex items-start gap-4">
					<div class="flex-1">
						<h3 class="font-medium mb-1">Compactar (VACUUM)</h3>
						<p class="text-sm text-ink-muted">Reorganiza o SQLite e reduz o tamanho do arquivo.</p>
					</div>
					<button class="btn btn-outline" onclick={vacuum}>Executar</button>
				</div>
			</div>
		</div>

		{#if result}
			<pre class="mt-6 card p-4 text-sm font-mono whitespace-pre-wrap">{result}</pre>
		{/if}
	</div>
</div>
