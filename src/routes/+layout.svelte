<script lang="ts">
	import { dev } from '$app/environment';
	import { onMount } from 'svelte';
	import '../app.css';

	let { children } = $props();

	onMount(() => {
		if (!dev || typeof navigator === 'undefined') return;

		navigator.serviceWorker?.getRegistrations().then((registrations) => {
			for (const registration of registrations) registration.unregister();
		});

		caches?.keys().then((keys) => {
			for (const key of keys) {
				if (key.startsWith('jwlbackup-')) caches.delete(key);
			}
		});
	});
</script>

{@render children()}
