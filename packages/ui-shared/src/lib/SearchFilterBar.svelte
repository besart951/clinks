<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	export interface FilterDef {
		key: string;
		label: string;
		value: string;
		options: { value: string; label: string }[];
	}

	let {
		search = '',
		searchPlaceholder = 'Search...',
		resetLabel = 'Reset',
		filters = [] as FilterDef[],
		onsearch = (_query: string) => {},
		onfilter = (_key: string, _value: string) => {},
		onrefresh = () => {},
	}: {
		search: string;
		searchPlaceholder?: string;
		resetLabel?: string;
		filters: FilterDef[];
		onsearch: (query: string) => void;
		onfilter: (key: string, value: string) => void;
		onrefresh: () => void;
	} = $props();
</script>

<div class="flex flex-wrap items-end gap-3">
	<Input
		type="search"
		placeholder={searchPlaceholder}
		value={search}
		oninput={(e) => onsearch(e.currentTarget.value)}
		class="max-w-xs"
	/>
	{#each filters as f}
		<select
			value={f.value}
			onchange={(e) => onfilter(f.key, e.currentTarget.value)}
			class="border-input bg-background ring-offset-background rounded-md border px-3 py-2 text-sm"
		>
			<option value="">{f.label}</option>
			{#each f.options as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	{/each}
	<Button type="button" variant="outline" size="sm" onclick={onrefresh}>{resetLabel}</Button>
</div>
