<script lang="ts">
	let { value, max, size = 44 }: { value: number; max: number; size?: number } = $props();

	const radius = 18;
	const circumference = 2 * Math.PI * radius;
	const ratio = $derived(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0);
	const tone = $derived(ratio >= 1 ? 'var(--success)' : ratio >= 0.75 ? 'var(--warning)' : 'var(--foreground)');
</script>

<span class="relative inline-grid shrink-0 place-items-center" style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 44 44" class="absolute inset-0 -rotate-90" aria-hidden="true">
		<circle cx="22" cy="22" r={radius} fill="none" stroke="var(--muted)" stroke-width="4" />
		<circle
			cx="22"
			cy="22"
			r={radius}
			fill="none"
			stroke={tone}
			stroke-width="4"
			stroke-linecap="round"
			stroke-dasharray={circumference}
			stroke-dashoffset={circumference * (1 - ratio)}
			class="transition-[stroke-dashoffset] duration-500"
		/>
	</svg>
	<b class="text-sm tabular-nums">{value}</b>
</span>
