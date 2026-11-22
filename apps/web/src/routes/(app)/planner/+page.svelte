<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Plus from '@lucide/svelte/icons/plus';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import * as Table from '@clinks/ui-shared/components/ui/table';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Checkbox } from '@clinks/ui-shared/components/ui/checkbox';
	import { Switch } from '@clinks/ui-shared/components/ui/switch';
	import { Label } from '@clinks/ui-shared/components/ui/label';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import SearchInput from '$lib/components/common/SearchInput.svelte';
	import Choice from '$lib/components/common/Choice.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import PersonAvatar from '$lib/components/common/PersonAvatar.svelte';
	import { priorityTone } from '$lib/components/common/tones';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import TaskBoard from '$lib/components/planner/TaskBoard.svelte';
	import TaskMonth from '$lib/components/planner/TaskMonth.svelte';
	import TaskSheet from '$lib/components/planner/TaskSheet.svelte';
	import { PlannerModel, type PlannerView } from '$lib/features/planner/planner.svelte';
	import { PeopleDirectory } from '$lib/features/collaboration/people.svelte';
	import { today } from '$lib/domain/dates';
	import type { Task } from '$lib/domain/types';
	import { routeQuery, setQuery } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new PlannerModel(workspace);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(workspace.session.can('planner.write'));
	let sheet: TaskSheet;
	const query = routeQuery(page.url);
	if (query.get('view')) model.view = query.get('view') as PlannerView;

	onMount(() => {
		void people.load();
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && sheet.show(null));
		void openFromQuery();
		return () => {
			stop();
			stopShortcut();
		};
	});

	async function openFromQuery() {
		const taskId = query.get('task');
		if (query.get('new') === '1' && canWrite) sheet.show(null);
		else if (taskId) {
			const task = await workspace.api.tasks.get(taskId as Task['id']).catch(() => null);
			if (task) sheet.show(task);
		}
	}

	function open(task: Task) {
		sheet.show(task);
		void setQuery(page.url, { task: task.id });
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.module.planner')} · CLinks</title></svelte:head>

<ModuleGate module="planner" permission="planner.read">
	<PageHeader title={workspace.t('ui.ws.module.planner')} description={workspace.t('ui.ws.planner.page_text')}>
		{#snippet actions()}
			{#if canWrite}<Button onclick={() => sheet.show(null)} aria-keyshortcuts="N">
					<Plus class="size-4" />{workspace.t('ui.ws.command.new_task')}
				</Button>{/if}
		{/snippet}
	</PageHeader>

	<div class="mb-4 flex flex-wrap items-center gap-2">
		<SearchInput bind:value={model.search} label={workspace.t('ui.ws.planner.search')} class="w-full sm:w-64" />
		<Choice
			bind:value={model.priority}
			class="w-40"
			label={workspace.t('ui.ws.planner.priority')}
			options={[
				{ value: '', label: workspace.t('ui.ws.planner.all_priorities') },
				...(['urgent', 'high', 'medium', 'low'] as const).map((priority) => ({
					value: priority,
					label: workspace.t(`ui.ws.task.priority.${priority}`),
				})),
			]}
		/>
		<Choice
			bind:value={model.label}
			class="w-40"
			label={workspace.t('ui.ws.planner.labels')}
			options={[
				{ value: '', label: workspace.t('ui.ws.planner.all_labels') },
				...model.labels.map((label) => ({ value: label, label })),
			]}
		/>
		<div class="flex items-center gap-2">
			<Switch id="only-mine" bind:checked={model.onlyMine} /><Label for="only-mine">
				{workspace.t('ui.ws.planner.only_mine')}
			</Label>
		</div>
		<div class="flex-1"></div>
		<Tabs.Root
			value={model.view}
			onValueChange={(view) => {
				model.view = view as PlannerView;
				void setQuery(page.url, { view });
			}}
		>
			<Tabs.List>
				<Tabs.Trigger value="board">{workspace.t('ui.ws.planner.view_board')}</Tabs.Trigger>
				<Tabs.Trigger value="list">{workspace.t('ui.ws.planner.view_list')}</Tabs.Trigger>
				<Tabs.Trigger value="calendar">{workspace.t('ui.ws.planner.view_calendar')}</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	</div>

	<AsyncView resource={model.resource} skeleton="cards">
		{#if model.view === 'board'}
			<TaskBoard {model} {people} onOpen={open} />
		{:else if model.view === 'list'}
			<div class="rounded-xl border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-10"><span class="sr-only">{workspace.t('ui.ws.task.status.done')}</span></Table.Head>
							<Table.Head>{workspace.t('ui.ws.calendar.title')}</Table.Head>
							<Table.Head class="hidden md:table-cell">{workspace.t('ui.ws.status')}</Table.Head>
							<Table.Head>{workspace.t('ui.ws.planner.priority')}</Table.Head>
							<Table.Head class="hidden sm:table-cell">{workspace.t('ui.ws.planner.due')}</Table.Head>
							<Table.Head class="hidden lg:table-cell">{workspace.t('ui.ws.planner.assignees')}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each [...model.filtered].sort( (left, right) => (left.dueDate ?? '9999').localeCompare(right.dueDate ?? '9999') ) as task (task.id)}
							<Table.Row>
								<Table.Cell>
									<Checkbox
										checked={task.status === 'done'}
										disabled={!canWrite}
										onCheckedChange={() => model.toggleDone(task)}
										aria-label={workspace.t('ui.ws.planner.mark_done', { title: task.title })}
									/>
								</Table.Cell>
								<Table.Cell>
									<button
										class="text-left font-medium hover:underline {task.status === 'done'
											? 'text-muted-foreground line-through'
											: ''}"
										onclick={() => open(task)}
									>
										{task.title}
									</button>
								</Table.Cell>
								<Table.Cell class="hidden md:table-cell">{workspace.t(`ui.ws.task.status.${task.status}`)}</Table.Cell>
								<Table.Cell>
									<StatusBadge
										tone={priorityTone[task.priority]}
										label={workspace.t(`ui.ws.task.priority.${task.priority}`)}
									/>
								</Table.Cell>
								<Table.Cell
									class="hidden sm:table-cell {task.dueDate && task.dueDate < today() && task.status !== 'done'
										? 'text-destructive'
										: ''}"
								>
									{task.dueDate ? workspace.i18n.date(task.dueDate) : '—'}
								</Table.Cell>
								<Table.Cell class="hidden lg:table-cell">
									<div class="flex -space-x-1.5">
										{#each task.assigneeIds as id (id)}{@const person = people.get(id)}{#if person}<span
													class="ring-background rounded-full ring-2"
												>
													<PersonAvatar {person} size="xs" />
												</span>{/if}{/each}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{:else}
			<TaskMonth tasks={model.filtered} onOpen={open} />
		{/if}
	</AsyncView>
</ModuleGate>

<TaskSheet
	bind:this={sheet}
	contacts={model.resource.data?.contacts ?? []}
	{people}
	onClose={() => setQuery(page.url, { task: null, new: null })}
/>
