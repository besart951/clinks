<script lang="ts">
	import Columns from '@lucide/svelte/icons/columns-3';
	import Rows from '@lucide/svelte/icons/rows-3';
	import { Button } from '@clinks/ui/components/ui/button';
	import type { TimeAxis } from './TimeGrid.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { axis, onchange }: { axis: TimeAxis; onchange: (axis: TimeAxis) => void } = $props();
	const workspace = useWorkspace();
	const options = [
		{ value: 'vertical', icon: Columns, label: 'ui.ws.calendar.axis_vertical' },
		{ value: 'horizontal', icon: Rows, label: 'ui.ws.calendar.axis_horizontal' },
	] as const;
</script>

<div class="bg-muted inline-flex rounded-lg p-0.5" role="group" aria-label={workspace.t('ui.ws.calendar.axis')}>
	{#each options as option (option.value)}
		<Button
			variant="ghost"
			size="icon-sm"
			class="aria-pressed:bg-background aria-pressed:shadow-xs"
			aria-pressed={axis === option.value}
			aria-label={workspace.t(option.label)}
			title={workspace.t(option.label)}
			onclick={() => onchange(option.value)}
		>
			<option.icon class="size-4" />
		</Button>
	{/each}
</div>
