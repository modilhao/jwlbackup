<script lang="ts">
	let { size = 28 }: { size?: number } = $props();
</script>

<div class="flex items-center gap-2">
	<svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
		<rect x="2" y="2" width="28" height="28" rx="7" fill="var(--color-coral)" />
		<path
			d="M10 11.5C10 10.6716 10.6716 10 11.5 10H20.5C21.3284 10 22 10.6716 22 11.5V19.5L18 17.5L14 19.5L10 17.5V11.5Z"
			fill="white"
		/>
		<path
			d="M11 21H21"
			stroke="white"
			stroke-width="1.6"
			stroke-linecap="round"
			opacity="0.6"
		/>
	</svg>
	<span class="serif text-lg font-medium tracking-tight">JWLBackup</span>
</div>
