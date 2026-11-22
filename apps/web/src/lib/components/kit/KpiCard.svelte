<script lang="ts" module>
	import type { Component } from 'svelte';

	export interface KpiSpec {
		label: string;
		value: string;
		/** Small denominator after the value, e.g. "/7". */
		of?: string;
		sub?: string;
		tone?: 'default' | 'danger';
		icon: Component<{ class?: string }>;
	}
</script>

<script lang="ts">
	import { href } from '#lib/navigation';

	let { kpi, path }: { kpi: KpiSpec; path: string } = $props();
</script>

<a
	href={href(path)}
	class="bg-card grid min-w-0 gap-1 rounded-xl border p-4 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
>
	<span
		class="flex items-center gap-1.5 text-[13px] {kpi.tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}"
	>
		<kpi.icon class="size-3.5" />{kpi.label}
	</span>
	<span class="truncate text-[28px] leading-9 font-semibold tracking-tight tabular-nums">
		{kpi.value}{#if kpi.of}<span class="text-muted-foreground text-lg font-normal">{kpi.of}</span>{/if}
	</span>
	{#if kpi.sub}<span
			class="truncate text-[13px] {kpi.tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}"
		>
			{kpi.sub}
		</span>{/if}
</a>
