<script lang="ts">
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import PersonAvatar from '$lib/components/common/PersonAvatar.svelte';
	import { priorityTone } from '$lib/components/common/tones';
	import type { PeopleDirectory } from '$lib/features/collaboration/people.svelte';
	import { today } from '$lib/domain/dates';
	import type { Task } from '$lib/domain/types';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { task, people }: { task: Task; people: PeopleDirectory } = $props();
	const workspace = useWorkspace();
	const done = $derived(task.checklist.filter((item) => item.done).length);
	const overdue = $derived(task.dueDate !== null && task.dueDate < today() && task.status !== 'done');
</script>

<div class="space-y-2">
	<p class="text-sm leading-snug font-medium {task.status === 'done' ? 'text-muted-foreground line-through' : ''}">
		{task.title}
	</p>
	{#if task.labels.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each task.labels as label (label)}<span class="bg-muted rounded px-1.5 py-0.5 text-[10px]">{label}</span>{/each}
		</div>
	{/if}
	<div class="text-muted-foreground flex items-center gap-2 text-xs">
		<StatusBadge tone={priorityTone[task.priority]} label={workspace.t(`ui.ws.task.priority.${task.priority}`)} />
		{#if task.dueDate}<span class="flex items-center gap-1 {overdue ? 'text-destructive' : ''}">
				<CalendarClock class="size-3" />{workspace.i18n.format(task.dueDate, { day: 'numeric', month: 'short' })}
			</span>{/if}
		{#if task.checklist.length > 0}<span class="flex items-center gap-1">
				<ListChecks class="size-3" />{done}/{task.checklist.length}
			</span>{/if}
		<span class="ml-auto flex -space-x-1.5">
			{#each task.assigneeIds as id (id)}
				{@const person = people.get(id)}
				{#if person}<span class="ring-background rounded-full ring-2"><PersonAvatar {person} size="xs" /></span>{/if}
			{/each}
		</span>
	</div>
</div>
