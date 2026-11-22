<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { Input } from '@clinks/ui/components/ui/input';
	import TaskCard from './TaskCard.svelte';
	import type { PlannerModel } from '#lib/features/planner/planner.svelte';
	import type { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import type { Task, TaskStatus } from '@clinks/domain/types';
	import type { TaskId } from '@clinks/domain/ids';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model, people, onOpen }: { model: PlannerModel; people: PeopleDirectory; onOpen: (task: Task) => void } =
		$props();
	const workspace = useWorkspace();
	const canWrite = $derived(workspace.session.can('planner.write'));
	let dragging = $state<Task | null>(null);
	let target = $state<{ status: TaskStatus; before: TaskId | null } | null>(null);
	let adding = $state<TaskStatus | null>(null);
	let newTitle = $state('');

	function over(event: DragEvent, status: TaskStatus, before: TaskId | null) {
		if (!dragging) return;
		event.preventDefault();
		event.stopPropagation();
		target = { status, before };
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		if (dragging && target) void model.moveTo(dragging, target.status, target.before);
		dragging = null;
		target = null;
	}

	async function add(status: TaskStatus) {
		await model.quickAdd(newTitle, status);
		newTitle = '';
	}

	/** Keyboard alternative to drag & drop: Alt + arrow keys move the focused card. */
	function onCardKey(event: KeyboardEvent, task: Task, index: number, column: Task[]) {
		if (!canWrite || !event.altKey) return;
		const statuses = model.columns.map((entry) => entry.status);
		const position = statuses.indexOf(task.status);
		if (event.key === 'ArrowRight' && position < statuses.length - 1)
			void model.moveTo(task, statuses[position + 1], null);
		else if (event.key === 'ArrowLeft' && position > 0) void model.moveTo(task, statuses[position - 1], null);
		else if (event.key === 'ArrowUp' && index > 0) void model.moveTo(task, task.status, column[index - 1].id);
		else if (event.key === 'ArrowDown' && index < column.length - 1)
			void model.moveTo(task, task.status, column[index + 2]?.id ?? null);
		else return;
		event.preventDefault();
	}
</script>

<div class="flex gap-3 overflow-x-auto pb-3">
	{#each model.columns as column (column.status)}
		<section
			class="bg-muted/40 flex w-72 shrink-0 flex-col rounded-xl border {target?.status === column.status
				? 'ring-primary/40 ring-2'
				: ''}"
			aria-label={workspace.t(`ui.ws.task.status.${column.status}`)}
			ondragover={(event) => over(event, column.status, null)}
			ondrop={drop}
		>
			<header class="flex items-center justify-between px-3 py-2">
				<h2 class="text-sm font-semibold">
					{workspace.t(`ui.ws.task.status.${column.status}`)}
					<span class="text-muted-foreground font-normal">{column.tasks.length}</span>
				</h2>
				{#if canWrite}
					<button
						class="text-muted-foreground hover:text-foreground rounded p-1"
						onclick={() => (adding = column.status)}
						aria-label={workspace.t('ui.ws.planner.add_in', {
							column: workspace.t(`ui.ws.task.status.${column.status}`),
						})}
					>
						<Plus class="size-4" />
					</button>
				{/if}
			</header>
			<ol class="flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2">
				{#each column.tasks as task, index (task.id)}
					<li ondragover={(event) => over(event, column.status, task.id)}>
						{#if target?.before === task.id && dragging?.id !== task.id}<div
								class="bg-primary mb-2 h-0.5 rounded"
							></div>{/if}
						<button
							type="button"
							draggable={canWrite}
							ondragstart={(event) => {
								dragging = task;
								event.dataTransfer?.setData('text/plain', task.id);
							}}
							ondragend={() => {
								dragging = null;
								target = null;
							}}
							onclick={() => onOpen(task)}
							onkeydown={(event) => onCardKey(event, task, index, column.tasks)}
							class="bg-card hover:border-foreground/20 w-full rounded-lg border p-3 text-left shadow-xs transition {dragging?.id ===
							task.id
								? 'opacity-40'
								: ''}"
							aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
						>
							<TaskCard {task} {people} />
						</button>
					</li>
				{/each}
				{#if adding === column.status}
					<li>
						<Input
							autofocus
							bind:value={newTitle}
							placeholder={workspace.t('ui.ws.planner.quick_add')}
							aria-label={workspace.t('ui.ws.planner.quick_add')}
							onkeydown={(event) => {
								if (event.key === 'Enter') void add(column.status);
								if (event.key === 'Escape') adding = null;
							}}
							onblur={() => {
								if (newTitle.trim()) void add(column.status);
								adding = null;
							}}
						/>
					</li>
				{/if}
			</ol>
		</section>
	{/each}
</div>
<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.planner.keyboard_hint')}</p>
