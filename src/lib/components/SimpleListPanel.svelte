<script lang="ts">
	let {
		title,
		columns,
		rows,
		empty = 'Nada por aqui ainda.'
	}: {
		title: string;
		columns: { key: string; label: string; width?: string }[];
		rows: Record<string, unknown>[];
		empty?: string;
	} = $props();
</script>

<div class="flex-1 overflow-y-auto">
	<div class="max-w-5xl mx-auto px-8 py-8">
		<h1 class="serif text-3xl font-medium mb-1">{title}</h1>
		<p class="text-ink-muted text-sm mb-6">{rows.length.toLocaleString('pt-BR')} {rows.length === 1 ? 'item' : 'itens'}</p>

		{#if rows.length === 0}
			<div class="card p-10 text-center text-ink-muted">{empty}</div>
		{:else}
			<div class="card overflow-hidden">
				<table class="w-full text-sm">
					<thead class="bg-cream-100 text-ink-muted">
						<tr>
							{#each columns as c}
								<th class="text-left font-medium px-4 py-2.5" style:width={c.width}>{c.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each rows as row, i}
							<tr class:zebra={i % 2 === 1}>
								{#each columns as c}
									<td class="px-4 py-2.5 align-top">{row[c.key] ?? ''}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<style>
	tr.zebra {
		background: var(--color-cream-50);
	}
	tbody tr:not(:last-child) {
		border-bottom: 1px solid var(--color-line-soft);
	}
</style>
