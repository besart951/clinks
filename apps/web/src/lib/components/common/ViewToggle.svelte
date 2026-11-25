<script lang="ts" module>
	export type ListView = 'table' | 'cards';
</script>

<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import TableIcon from '@lucide/svelte/icons/table-2';
	import { Button } from '@clinks/ui/components/ui/button';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Switches a list between rows (table) and cards. */
	let { view, onchange }: { view: ListView; onchange: (view: ListView) => void } = $props();
	const workspace = useWorkspace();
	const options = [
		{ value: 'table', icon: TableIcon, label: 'ui.ws.view.table' },
		{ value: 'cards', icon: LayoutGrid, label: 'ui.ws.view.cards' },
	] as const;
</script>

<div class="bg-muted inline-flex rounded-lg p-0.5" role="group" aria-label={workspace.t('ui.ws.view.label')}>
	{#each options as option (option.value)}
		<Button
			variant="ghost"
			size="icon-sm"
			class="aria-pressed:bg-background aria-pressed:shadow-xs"
			aria-pressed={view === option.value}
			aria-label={workspace.t(option.label)}
			title={workspace.t(option.label)}
			onclick={() => onchange(option.value)}
		>
			<option.icon class="size-4" />
		</Button>
	{/each}
</div>
