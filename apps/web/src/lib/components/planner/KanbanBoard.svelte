<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { Input } from '@clinks/ui/components/ui/input';
	import TaskCard from './TaskCard.svelte';
	import ChipChoice from '#lib/components/common/ChipChoice.svelte';
	import { BoardDrag, flip, land, type DropTarget } from './board-drag.svelte';
	import type { PlannerModel } from '#lib/features/planner/planner.svelte';
	import type { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { taskStatuses, type Task, type TaskStatus } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model, people, onOpen }: { model: PlannerModel; people: PeopleDirectory; onOpen: (task: Task) => void } =
		$props();
	const workspace = useWorkspace();
	const canWrite = $derived(workspace.session.can('planner.write'));
	const drag = new BoardDrag({
		canWrite: () => canWrite,
		find: (id) => model.find(id),
		move,
	});
	let board: HTMLElement;
	let adding = $state<TaskStatus | null>(null);
	let newTitle = $state('');
	let announcement = $state('');

	type BoardItem = { kind: 'card'; key: string; task: Task } | { kind: 'slot'; key: string; height: number };

	/** The column's cards, with the drop slot where the lifted card would land. */
	function items(status: TaskStatus, tasks: Task[]): BoardItem[] {
		const list: BoardItem[] = tasks.map((task) => ({ kind: 'card', key: task.id, task }));
		const target = drag.target;
		if (target?.status !== status) return list;
		let seen = 0;
		let at = list.length;
		for (const [position, item] of list.entries()) {
			if (item.kind === 'card' && item.task.id === drag.liftedId) continue;
			if (seen === target.index) {
				at = position;
				break;
			}
			seen += 1;
		}
		list.splice(at, 0, { kind: 'slot', key: 'drop-slot', height: target.height });
		return list;
	}

	/** Moves the task (optimistically, so the board updates at once) and tells screen readers where it went. */
	function move(task: Task, target: DropTarget) {
		const saving = model.moveTo(task, target.status, target.index);
		const column = model.column(target.status);
		const position = column.findIndex((row) => row.id === task.id) + 1;
		// Clear first so the same text twice in a row is still announced.
		announcement = '';
		setTimeout(() => {
			announcement = workspace.t('ui.ws.planner.moved_announce', {
				title: task.title,
				column: workspace.t(`ui.ws.task.status.${target.status}`),
				position: String(position),
				count: String(column.length),
			});
		}, 500);
		return saving;
	}

	/** Keyboard alternative to dragging: Alt + arrow keys move the focused card, which keeps its focus. */
	async function onCardKey(event: KeyboardEvent, task: Task) {
		if (!event.altKey || !canWrite) return;
		const columnIndex = taskStatuses.indexOf(task.status);
		const index = model.column(task.status).findIndex((row) => row.id === task.id);
		const across = (status: TaskStatus) => ({ status, index: Math.min(index, model.column(status).length) });
		const target: DropTarget | null =
			event.key === 'ArrowLeft' && columnIndex > 0
				? across(taskStatuses[columnIndex - 1])
				: event.key === 'ArrowRight' && columnIndex < taskStatuses.length - 1
					? across(taskStatuses[columnIndex + 1])
					: event.key === 'ArrowUp' && index > 0
						? { status: task.status, index: index - 1 }
						: event.key === 'ArrowDown' && index < model.column(task.status).length - 1
							? { status: task.status, index: index + 1 }
							: null;
		if (!target) return;
		event.preventDefault();
		await flip(board, () => void move(task, target));
		if (target.status !== task.status) drag.bump(target.status);
		const card = board.querySelector<HTMLElement>(`[data-card="${task.id}"]`);
		card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		card?.querySelector('button')?.focus({ preventScroll: true });
		land(card);
	}

	/** Phones show one column at a time; the chips above jump between them and follow the swipe. */
	let current = $state(0);
	function columnWidth() {
		return board.querySelector<HTMLElement>('[data-column]')?.offsetWidth ?? board.clientWidth;
	}
	function showColumn(index: number) {
		board.scrollTo({ left: index * (columnWidth() + 12), behavior: 'smooth' });
	}
	let chips = $state<HTMLElement>();
	function followScroll() {
		const next = Math.round(board.scrollLeft / (columnWidth() + 12));
		if (next === current) return;
		current = next;
		chips?.children[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	async function add(status: TaskStatus) {
		await model.quickAdd(newTitle, status);
		newTitle = '';
	}
</script>

<div class="mb-2 md:hidden">
	<ChipChoice
		bind:ref={chips}
		items={model.columns.map((column) => ({ ...column, key: column.status }))}
		selected={model.columns[current]?.status ?? null}
		label={workspace.t('ui.ws.planner.columns')}
		onselect={(_column, index) => showColumn(index)}
	>
		{#snippet chip(column)}
			{workspace.t(`ui.ws.task.status.${column.status}`)}
			<span class="tabular-nums opacity-70">{column.tasks.length}</span>
		{/snippet}
	</ChipChoice>
</div>
<div
	bind:this={board}
	data-board
	onscroll={followScroll}
	class="-mx-1 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-1 pt-1 pb-4 md:snap-none"
	{@attach (node) => drag.attach(node)}
>
	{#each model.columns as column (column.status)}
		{@const label = workspace.t(`ui.ws.task.status.${column.status}`)}
		<section
			data-column={column.status}
			aria-labelledby="column-{column.status}"
			class="group/column flex w-[88%] shrink-0 snap-start flex-col gap-2 rounded-xl p-2 sm:w-[272px] transition-colors duration-200 {drag
				.target?.status === column.status && drag.liftedId
				? 'bg-muted ring-border ring-1 ring-inset'
				: 'bg-muted/40'}"
		>
			<header class="flex h-8 items-center gap-2 ps-2 pe-1">
				<h2 id="column-{column.status}" class="text-[13px] leading-[18px] font-medium">{label}</h2>
				<span class="count text-muted-foreground text-xs tabular-nums" class:bump={drag.bumped === column.status}>
					{column.tasks.length}
				</span>
				{#if canWrite}
					<button
						type="button"
						data-no-drag
						class="text-muted-foreground hover:text-foreground hover:bg-background ms-auto rounded-md p-1 opacity-0 transition-opacity group-focus-within/column:opacity-100 group-hover/column:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
						onclick={() => (adding = column.status)}
						aria-label={workspace.t('ui.ws.planner.add_in', { column: label })}
					>
						<Plus class="size-4" />
					</button>
				{/if}
			</header>
			<ol data-list class="relative flex min-h-16 flex-col gap-2" aria-label={label}>
				{#each items(column.status, column.tasks) as item (item.key)}
					{#if item.kind === 'slot'}
						<li
							aria-hidden="true"
							class="bg-background/60 border-foreground/20 rounded-lg border border-dashed"
							style:height="{item.height}px"
						></li>
					{:else}
						<li data-card={item.task.id} class="item">
							<button
								type="button"
								class="kcard bg-card hover:border-input focus-visible:outline-ring block w-full rounded-lg border p-3 text-left shadow-xs hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
								onclick={() => onOpen(item.task)}
								onkeydown={(event) => onCardKey(event, item.task)}
								aria-keyshortcuts={canWrite ? 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown' : undefined}
								aria-describedby={canWrite ? 'board-hint' : undefined}
							>
								<TaskCard task={item.task} {people} />
							</button>
						</li>
					{/if}
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
{#if canWrite}<p id="board-hint" class="text-muted-foreground hidden text-xs md:block">
		{workspace.t('ui.ws.planner.keyboard_hint')}
	</p>{/if}
<p role="status" class="sr-only">{announcement}</p>

<style>
	.kcard {
		cursor: grab;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		-webkit-user-select: none;
		user-select: none;
		transition:
			box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1),
			border-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
			transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	/* The real card is lifted out of the flow and follows the pointer; its slot shows where it lands. */
	.item:global([data-lifted]) {
		position: fixed;
		z-index: 50;
		margin: 0;
		pointer-events: none;
	}
	.item:global([data-lifted]) .kcard {
		cursor: grabbing;
		box-shadow: var(--shadow-md, 0 4px 12px rgb(0 0 0 / 0.12));
		transform: rotate(1.5deg) scale(1.03);
	}
	/* A touch press that has been held long enough to drag. */
	.item:global([data-armed]) .kcard {
		box-shadow: var(--shadow-md, 0 4px 12px rgb(0 0 0 / 0.12));
		transform: scale(1.03);
	}
	:global(html[data-board-dragging]),
	:global(html[data-board-dragging] *) {
		cursor: grabbing !important;
	}
	/* Snapping would pull the board back to a column while a card is dragged towards the next one. */
	:global(html[data-board-dragging] [data-board]) {
		scroll-snap-type: none;
	}
	.count {
		display: inline-block;
		transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.count.bump {
		transform: scale(1.35);
	}
	@media (prefers-reduced-motion: reduce) {
		.kcard,
		.count {
			transition: none;
		}
		.item:global([data-lifted]) .kcard,
		.item:global([data-armed]) .kcard,
		.count.bump {
			transform: none;
		}
	}
</style>
