<script lang="ts">
	import Flag from '@lucide/svelte/icons/flag';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import PersonAvatar from '#lib/components/common/PersonAvatar.svelte';
	import type { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { today } from '@clinks/domain/dates';
	import type { Task } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { task, people }: { task: Task; people: PeopleDirectory } = $props();
	const workspace = useWorkspace();
	const done = $derived(task.checklist.filter((item) => item.done).length);
	const overdue = $derived(task.dueDate !== null && task.dueDate < today() && task.status !== 'done');
	const flagged = $derived(task.priority === 'high' || task.priority === 'urgent');
</script>

<!-- Short by design: title (max two lines) and one meta line; details open in the sheet. -->
<span class="flex items-start gap-2">
	<span
		class="line-clamp-2 min-w-0 flex-1 text-sm leading-5 font-medium {task.status === 'done'
			? 'text-muted-foreground line-through'
			: ''}"
	>
		{task.title}
	</span>
	{#if flagged}
		<span class={task.priority === 'urgent' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}>
			<Flag class="size-3.5" aria-hidden="true" />
			<span class="sr-only">{workspace.t(`ui.ws.task.priority.${task.priority}`)}</span>
		</span>
	{/if}
</span>
<span class="text-muted-foreground mt-3 flex items-center gap-2 text-xs leading-4 whitespace-nowrap">
	{#if task.labels[0]}
		<span class="min-w-0 truncate rounded-md border px-1.5 leading-5">{task.labels[0]}</span>
	{/if}
	{#if task.dueDate}
		<span class={overdue ? 'text-destructive font-medium' : ''}>
			{workspace.i18n.format(task.dueDate, { day: 'numeric', month: 'short' })}
		</span>
	{/if}
	{#if task.checklist.length > 0}
		<span class="flex items-center gap-1">
			<ListChecks class="size-3" aria-hidden="true" />{done}/{task.checklist.length}
		</span>
	{/if}
	<span class="ms-auto flex shrink-0 -space-x-1.5">
		{#each task.assigneeIds.slice(0, 3) as id (id)}
			{@const person = people.get(id)}
			{#if person}<span class="ring-card rounded-full ring-2"><PersonAvatar {person} size="xs" /></span>{/if}
		{/each}
	</span>
</span>
