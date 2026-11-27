<script lang="ts">
	/**
	 * A small flag as SVG: emoji flags do not show on Windows (it prints «CH» instead), so they are drawn here.
	 * Decorative; the language's name always stands next to it.
	 */
	let { country, class: className = '' }: { country: 'ch' | 'us'; class?: string } = $props();
</script>

<span
	class="inline-flex h-3.5 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10 {country === 'ch'
		? 'w-3.5'
		: 'w-[1.33rem]'} {className}"
	aria-hidden="true"
>
	<svg viewBox={country === 'ch' ? '0 0 32 32' : '0 0 38 20'} preserveAspectRatio="none" class="size-full">
		{#if country === 'ch'}
			<rect width="32" height="32" fill="#da291c" />
			<rect x="13" y="6" width="6" height="20" fill="#fff" />
			<rect x="6" y="13" width="20" height="6" fill="#fff" />
		{:else}
			<rect width="38" height="20" fill="#fff" />
			{#each [0, 2, 4, 6, 8, 10, 12] as stripe (stripe)}
				<rect y={(stripe * 20) / 13} width="38" height={20 / 13} fill="#b22234" />
			{/each}
			<rect width="15.2" height={(7 * 20) / 13} fill="#3c3b6e" />
		{/if}
	</svg>
</span>
