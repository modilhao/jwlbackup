<script lang="ts">
	import type { Counts } from '$lib/types';
	import Logo from './Logo.svelte';

	type Tab = 'notes' | 'highlights' | 'bookmarks' | 'tags' | 'playlists' | 'locations' | 'media' | 'maintenance';

	let {
		current = $bindable<Tab>('notes'),
		counts
	}: { current: Tab; counts: Counts } = $props();

	const items: { id: Tab; label: string; count: number; icon: string }[] = $derived([
		{ id: 'notes', label: 'Notas', count: counts.notes, icon: 'M11 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' },
		{ id: 'highlights', label: 'Marcações', count: counts.userMarks, icon: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0z' },
		{ id: 'bookmarks', label: 'Favoritos', count: counts.bookmarks, icon: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' },
		{ id: 'tags', label: 'Etiquetas', count: counts.tags, icon: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01' },
		{ id: 'playlists', label: 'Playlists', count: counts.playlistItems, icon: 'M9 18V5l12-2v13M9 9l12-2M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
		{ id: 'locations', label: 'Localizações', count: counts.locations, icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
		{ id: 'media', label: 'Mídia', count: counts.independentMedia, icon: 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z' },
		{ id: 'maintenance', label: 'Manutenção', count: 0, icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' }
	]);
</script>

<aside class="w-60 shrink-0 border-r border-line py-5 px-3 flex flex-col gap-1">
	<div class="px-3 mb-4">
		<Logo />
	</div>

	{#each items as item}
		<button
			class="nav-item"
			class:active={current === item.id}
			onclick={() => (current = item.id)}
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<path d={item.icon} />
			</svg>
			<span class="flex-1 text-left">{item.label}</span>
			{#if item.count > 0}
				<span class="text-xs text-ink-muted tabular-nums">{item.count.toLocaleString('pt-BR')}</span>
			{/if}
		</button>
	{/each}
</aside>

<style>
	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.9375rem;
		color: var(--color-ink-soft);
		transition: background 0.12s ease, color 0.12s ease;
	}
	.nav-item:hover {
		background: var(--color-cream-100);
		color: var(--color-ink);
	}
	.nav-item.active {
		background: var(--color-coral-faint);
		color: var(--color-coral);
		font-weight: 500;
	}
</style>
