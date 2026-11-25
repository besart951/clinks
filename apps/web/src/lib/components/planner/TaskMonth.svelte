<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Button } from '@clinks/ui/components/ui/button';
	import { addMonths, monthGrid, today } from '@clinks/domain/dates';
	import type { Task } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void } = $props();
	const workspace = useWorkspace();
	let anchor = $state(today());
	const days = $derived(monthGrid(anchor));
	const agenda = $derived(
		[...new Set(tasks.filter((task) => task.dueDate?.startsWith(anchor.slice(0, 7))).map((task) => task.dueDate!))]
			.sort()
			.map((date) => ({ date, tasks: tasks.filter((task) => task.dueDate === date) })),
	);
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
<!-- Phones: the month's due tasks as a list by day; seven columns of titles are unreadable at that width. -->
<div class="space-y-4 md:hidden">
	{#each agenda as day (day.date)}
		<section aria-labelledby="due-{day.date}">
			<h3
				id="due-{day.date}"
				class="mb-1 text-sm font-semibold capitalize {day.date === today() ? 'text-primary' : ''} {day.date < today()
					? 'text-muted-foreground'
					: ''}"
			>
				{workspace.i18n.format(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}
			</h3>
			<ul class="bg-card divide-y rounded-xl border">
				{#each day.tasks as task (task.id)}
					<li>
						<button
							class="hover:bg-accent flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm {task.status ===
							'done'
								? 'text-muted-foreground line-through'
								: ''}"
							onclick={() => onOpen(task)}
						>
							<span class="min-w-0 flex-1 truncate">{task.title}</span>
							<span class="text-muted-foreground shrink-0 text-xs no-underline">
								{workspace.t(`ui.ws.task.status.${task.status}`)}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
			{workspace.t('ui.ws.planner.none_due')}
		</p>
	{/each}
</div>
<div class="hidden grid-cols-7 overflow-hidden rounded-xl border md:grid">
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
