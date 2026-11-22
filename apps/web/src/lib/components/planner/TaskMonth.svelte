<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { addMonths, monthGrid, today } from '#lib/domain/dates';
	import type { Task } from '#lib/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void } = $props();
	const workspace = useWorkspace();
	let anchor = $state(today());
	const days = $derived(monthGrid(anchor));
</script>

<div class="mb-3 flex items-center gap-2">
	<Button
		variant="ghost"
		size="icon-sm"
		onclick={() => (anchor = addMonths(anchor, -1))}
		aria-label={workspace.t('ui.ws.calendar.previous')}
	>
		<ChevronLeft class="size-4" />
	</Button>
	<Button
		variant="ghost"
		size="icon-sm"
		onclick={() => (anchor = addMonths(anchor, 1))}
		aria-label={workspace.t('ui.ws.calendar.next')}
	>
		<ChevronRight class="size-4" />
	</Button>
	<h2 class="font-semibold capitalize">{workspace.i18n.format(anchor, { month: 'long', year: 'numeric' })}</h2>
</div>
<div class="grid grid-cols-7 overflow-hidden rounded-xl border">
	{#each days as day (day)}
		{@const due = tasks.filter((task) => task.dueDate === day)}
		<div
			class="min-h-24 border-r border-b p-1.5 text-xs {day.slice(0, 7) !== anchor.slice(0, 7)
				? 'bg-muted/40 text-muted-foreground'
				: ''}"
		>
			<p class="mb-1 {day === today() ? 'text-primary font-bold' : ''}">
				{workspace.i18n.format(day, { weekday: 'short', day: 'numeric' })}
			</p>
			<ul class="space-y-0.5">
				{#each due as task (task.id)}
					<li>
						<button
							class="hover:bg-muted w-full truncate rounded px-1 text-left {task.status === 'done'
								? 'line-through opacity-60'
								: ''}"
							onclick={() => onOpen(task)}
						>
							{task.title}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
