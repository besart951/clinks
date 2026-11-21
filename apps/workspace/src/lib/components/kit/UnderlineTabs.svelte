<script lang="ts" module>
	export interface UnderlineTab {
		value: string;
		label: string;
		count?: string | number;
	}
</script>

<script lang="ts">
	let { tabs, value = $bindable() }: { tabs: UnderlineTab[]; value: string } = $props();
</script>

<div class="mb-4 flex gap-1 overflow-x-auto border-b" role="tablist">
	{#each tabs as tab (tab.value)}
		<button
			type="button"
			role="tab"
			aria-selected={value === tab.value}
			class="-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2 text-sm transition-colors {value ===
			tab.value
				? 'border-foreground text-foreground font-medium'
				: 'text-muted-foreground hover:text-foreground border-transparent'}"
			onclick={() => (value = tab.value)}
		>
			{tab.label}
			{#if tab.count !== undefined}<span class="bg-muted rounded px-1.5 text-[11px] font-normal tabular-nums"
					>{tab.count}</span
				>{/if}
		</button>
	{/each}
</div>
