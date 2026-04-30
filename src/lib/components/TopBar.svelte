<script lang="ts">
	import { archiveStore } from '$lib/store.svelte';
	import { packJwlibrary, downloadBlob, makeBackupName } from '$lib/jwlibrary';

	let saving = $state(false);

	async function save() {
		const archive = archiveStore.current;
		if (!archive) return;
		saving = true;
		try {
			const blob = await packJwlibrary(archive);
			const name = makeBackupName(archive.manifest.userDataBackup.deviceName);
			downloadBlob(blob, name);
			archiveStore.dirty = false;
		} finally {
			saving = false;
		}
	}

	function close() {
		if (archiveStore.dirty && !confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
		archiveStore.close();
	}
</script>

<header class="h-14 shrink-0 border-b border-line bg-cream-50/80 backdrop-blur flex items-center px-5 gap-3">
	<div class="flex-1 flex items-center gap-3 min-w-0">
		{#if archiveStore.current}
			<span class="font-mono text-sm text-ink-soft truncate">
				{archiveStore.current.originalName}
			</span>
			<span class="chip">
				{archiveStore.current.manifest.userDataBackup.deviceName}
			</span>
			{#if archiveStore.dirty}
				<span class="chip" style="background:var(--color-coral-faint);color:var(--color-coral);border-color:transparent;">
					alterações pendentes
				</span>
			{/if}
		{/if}
	</div>

	<div class="flex items-center gap-2">
		<button class="btn btn-ghost" onclick={close}>Fechar</button>
		<button class="btn btn-primary" onclick={save} disabled={saving}>
			{saving ? 'Salvando…' : 'Salvar backup'}
		</button>
	</div>
</header>
