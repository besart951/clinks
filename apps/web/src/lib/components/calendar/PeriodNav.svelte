<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Button } from '@clinks/ui/components/ui/button';
	import DateJump, { type JumpUnit } from './DateJump.svelte';
	import type { CalendarDate } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Phones: previous · the period on show, to tap for the small calendar · next. */
	let {
		value,
		label,
		units,
		initial,
		onstep,
		onpick,
	}: {
		value: CalendarDate;
		label: string;
		units: Exclude<JumpUnit, 'year'>[];
		initial?: JumpUnit;
		onstep: (direction: -1 | 1) => void;
		onpick: (unit: Exclude<JumpUnit, 'year'>, date: CalendarDate) => void;
	} = $props();
	const workspace = useWorkspace();
</script>

<div class="flex items-center gap-1">
	<Button
		variant="outline"
		size="icon"
		class="size-11 shrink-0"
		onclick={() => onstep(-1)}
		aria-label={workspace.t('ui.ws.calendar.previous')}
	>
		<ChevronLeft class="size-5" />
	</Button>
	<div class="flex min-w-0 flex-1 justify-center">
		<DateJump {value} {units} {initial} {label} {onpick} />
	</div>
	<Button
		variant="outline"
		size="icon"
		class="size-11 shrink-0"
		onclick={() => onstep(1)}
		aria-label={workspace.t('ui.ws.calendar.next')}
	>
		<ChevronRight class="size-5" />
	</Button>
</div>
