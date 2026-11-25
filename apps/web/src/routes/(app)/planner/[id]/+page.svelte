<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '@clinks/ui/components/ui/button';
	import SideCard from '@clinks/ui/kit/SideCard.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import UnsavedChangesGuard from '#lib/components/common/UnsavedChangesGuard.svelte';
	import CommentThread from '#lib/components/collaboration/CommentThread.svelte';
	import AttachmentPanel from '#lib/components/collaboration/AttachmentPanel.svelte';
	import ObjectTimeline from '#lib/components/collaboration/ObjectTimeline.svelte';
	import DetailHeader from '#lib/components/kit/DetailHeader.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import TaskMainFields from '#lib/components/planner/TaskMainFields.svelte';
	import TaskMetaFields from '#lib/components/planner/TaskMetaFields.svelte';
	import { TaskFormModel } from '#lib/features/planner/task-form.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { Resource } from '#lib/state/resource.svelte';
	import type { Task } from '@clinks/domain/types';
	import { navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const id = page.params.id as Task['id'];
	const people = new PeopleDirectory(workspace);
	const form = new TaskFormModel(workspace);
	const canWrite = $derived(workspace.session.can('planner.write'));
	let confirm = $state<ConfirmRequest | null>(null);
	const resource = new Resource(workspace.db, ['tasks', 'contacts'], async () => {
		const [task, contacts] = await Promise.all([workspace.api.tasks.get(id), workspace.api.contacts.list()]);
		return { task, contacts };
	});

	onMount(() => resource.connect());

	// Shows the stored task, and changes others make to it, as long as nothing is being edited here.
	$effect(() => {
		const task = resource.data?.task;
		if (!task) return;
		if (!form.original || (!form.dirty && task.revision !== form.original.revision)) form.start(task);
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		await form.save();
	}

	function askDelete() {
		confirm = {
			title: workspace.t('ui.ws.planner.delete_title'),
			description: workspace.t('ui.ws.contacts.delete_text'),
			confirmLabel: workspace.t('ui.ws.delete'),
			destructive: true,
			onConfirm: async () => {
				if (await form.remove()) await navigate('/planner');
			},
		};
	}
</script>

<svelte:head><title>{form.original?.title ?? workspace.t('ui.ws.module.planner')} · CLinks</title></svelte:head>

<ModuleGate module="planner" permission="planner.read">
	<AsyncView {resource} skeleton="detail">
		{#if form.original}
			{@const task = form.original}
			<DetailHeader
				header={{
					title: task.title,
					back: { label: workspace.t('ui.ws.module.planner'), path: '/planner' },
					meta: [workspace.t('ui.ws.planner.updated', { time: workspace.i18n.relative(task.updatedAt) })],
					badges: [
						workspace.t(`ui.ws.task.status.${task.status}`),
						workspace.t(`ui.ws.task.priority.${task.priority}`),
					],
				}}
			>
				{#snippet actions()}
					{#if canWrite}
						<Button variant="ghost" class="text-destructive" onclick={askDelete}>
							<Trash2 class="size-4" />{workspace.t('ui.ws.delete')}
						</Button>
						<Button type="submit" form="task-main" disabled={form.busy || !form.dirty}>
							{workspace.t('ui.save')}
						</Button>
					{/if}
				{/snippet}
			</DetailHeader>

			<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div class="grid min-w-0 gap-6">
					<form
						id="task-main"
						class="bg-card grid gap-4 rounded-xl border p-5 shadow-[var(--shadow-sm)]"
						onsubmit={submit}
						novalidate
					>
						<fieldset disabled={!canWrite} class="grid gap-4">
							<TaskMainFields {form} rows={8} />
						</fieldset>
					</form>
					<section class="bg-card grid gap-3 rounded-xl border p-5 shadow-[var(--shadow-sm)]">
						<h2 class="text-sm font-semibold">{workspace.t('ui.ws.comments.title')}</h2>
						<CommentThread
							target={{ kind: 'task', id: task.id }}
							context={{ label: task.title, path: `/planner/${task.id}` }}
							{people}
						/>
					</section>
					{#if workspace.session.can('audit.read')}
						<section class="bg-card grid gap-3 rounded-xl border p-5 shadow-[var(--shadow-sm)]">
							<h2 class="text-sm font-semibold">{workspace.t('ui.ws.nav.activity')}</h2>
							<ObjectTimeline targetId={task.id} {people} />
						</section>
					{/if}
				</div>
				<aside class="grid gap-4 lg:sticky lg:top-4">
					<SideCard card={{ title: workspace.t('ui.ws.planner.details') }}>
						<!-- Its own form, so Enter in these fields saves too; the header button submits the main one. -->
						<form class="grid gap-4" onsubmit={submit} novalidate>
							<fieldset disabled={!canWrite} class="grid gap-4">
								<TaskMetaFields {form} {people} contacts={resource.data?.contacts ?? []} narrow />
							</fieldset>
						</form>
					</SideCard>
					<SideCard card={{ title: workspace.t('ui.ws.documents.attachments') }}>
						<AttachmentPanel target={{ kind: 'task', id: task.id }} />
					</SideCard>
				</aside>
			</div>
		{/if}
	</AsyncView>
</ModuleGate>

<UnsavedChangesGuard dirty={form.dirty && canWrite} />
<ConfirmDialog bind:request={confirm} />
