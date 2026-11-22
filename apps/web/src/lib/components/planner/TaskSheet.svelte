<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import * as Sheet from '@clinks/ui-shared/components/ui/sheet';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import { Checkbox } from '@clinks/ui-shared/components/ui/checkbox';
	import FormField from '#lib/components/common/FormField.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import ContactPicker from '#lib/components/common/ContactPicker.svelte';
	import PersonAvatar from '#lib/components/common/PersonAvatar.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import CommentThread from '#lib/components/collaboration/CommentThread.svelte';
	import AttachmentPanel from '#lib/components/collaboration/AttachmentPanel.svelte';
	import ObjectTimeline from '#lib/components/collaboration/ObjectTimeline.svelte';
	import { TaskFormModel } from '#lib/features/planner/task-form.svelte';
	import type { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { taskStatuses, type Contact, type Task } from '#lib/domain/types';
	import type { Draft } from '#lib/data/repository';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { contacts, people, onClose }: { contacts: Contact[]; people: PeopleDirectory; onClose?: () => void } = $props();
	const workspace = useWorkspace();
	const form = new TaskFormModel(workspace);
	const canWrite = $derived(workspace.session.can('planner.write'));
	let open = $state(false);
	let tab = $state('details');
	let confirm = $state<ConfirmRequest | null>(null);
	const doneItems = $derived(form.value.checklist.filter((item) => item.done).length);

	export function show(task: Task | null, preset: Partial<Draft<Task>> = {}) {
		form.start(task, preset);
		tab = 'details';
		open = true;
	}

	function close(next: boolean) {
		if (next) return;
		const finish = () => {
			open = false;
			onClose?.();
		};
		if (!form.dirty || !canWrite) return finish();
		confirm = {
			title: workspace.t('ui.ws.unsaved.title'),
			description: workspace.t('ui.ws.unsaved.text'),
			confirmLabel: workspace.t('ui.ws.unsaved.discard'),
			destructive: true,
			onConfirm: finish,
		};
	}

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
				if (await form.remove()) {
					open = false;
					onClose?.();
				}
			},
		};
	}
</script>

<Sheet.Root {open} onOpenChange={close}>
	<Sheet.Content closeLabel={workspace.t('ui.ws.close')} class="w-full overflow-y-auto sm:max-w-xl">
		<Sheet.Header>
			<Sheet.Title>{form.original ? form.original.title : workspace.t('ui.ws.command.new_task')}</Sheet.Title>
			<Sheet.Description>
				{form.original
					? workspace.t('ui.ws.planner.updated', { time: workspace.i18n.relative(form.original.updatedAt) })
					: workspace.t('ui.ws.planner.form_text')}
			</Sheet.Description>
		</Sheet.Header>
		<div class="px-4">
			<Tabs.Root bind:value={tab}>
				<Tabs.List class="mb-4">
					<Tabs.Trigger value="details">{workspace.t('ui.ws.planner.details')}</Tabs.Trigger>
					<Tabs.Trigger value="comments" disabled={!form.original}>{workspace.t('ui.ws.comments.title')}</Tabs.Trigger>
					<Tabs.Trigger value="files" disabled={!form.original}>
						{workspace.t('ui.ws.documents.attachments')}
					</Tabs.Trigger>
					<Tabs.Trigger value="activity" disabled={!form.original}>{workspace.t('ui.ws.nav.activity')}</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="details">
					<form id="task-form" class="space-y-4" onsubmit={submit} novalidate>
						<fieldset disabled={!canWrite} class="space-y-4">
							<FormField id="t-title" label={workspace.t('ui.ws.calendar.title')} error={form.fields.title}>
								<Input id="t-title" bind:value={form.value.title} aria-invalid={!!form.fields.title} />
							</FormField>
							<FormField id="t-description" label={workspace.t('ui.ws.planner.description')}>
								<Textarea id="t-description" rows={4} bind:value={form.value.description} />
							</FormField>
							<div class="grid grid-cols-3 gap-3">
								<FormField id="t-status" label={workspace.t('ui.ws.status')}>
									<Choice
										id="t-status"
										bind:value={form.value.status}
										options={taskStatuses.map((status) => ({
											value: status,
											label: workspace.t(`ui.ws.task.status.${status}`),
										}))}
									/>
								</FormField>
								<FormField id="t-priority" label={workspace.t('ui.ws.planner.priority')}>
									<Choice
										id="t-priority"
										bind:value={form.value.priority}
										options={(['low', 'medium', 'high', 'urgent'] as const).map((priority) => ({
											value: priority,
											label: workspace.t(`ui.ws.task.priority.${priority}`),
										}))}
									/>
								</FormField>
								<FormField id="t-due" label={workspace.t('ui.ws.planner.due')}>
									<Input
										id="t-due"
										type="date"
										value={form.value.dueDate ?? ''}
										oninput={(event) => (form.value.dueDate = event.currentTarget.value || null)}
									/>
								</FormField>
							</div>
							<fieldset class="space-y-1.5">
								<legend class="text-sm font-medium">{workspace.t('ui.ws.planner.assignees')}</legend>
								<div class="flex flex-wrap gap-1.5">
									{#each people.people as person (person.id)}
										<button
											type="button"
											class="flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs aria-pressed:border-foreground aria-pressed:bg-muted"
											aria-pressed={form.value.assigneeIds.includes(person.id)}
											onclick={() => form.toggleAssignee(person.id)}
										>
											<PersonAvatar {person} size="xs" />{person.name}
										</button>
									{/each}
								</div>
							</fieldset>
							<FormField id="t-contact" label={workspace.t('ui.ws.calendar.contact')}>
								<ContactPicker id="t-contact" bind:value={form.value.contactId} {contacts} />
							</FormField>
							<FormField id="t-labels" label={workspace.t('ui.ws.planner.labels')}>
								<div class="space-y-2">
									<div class="flex flex-wrap gap-1">
										{#each form.value.labels as label (label)}
											<span class="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs">
												{label}<button
													type="button"
													class="rounded-full p-0.5 hover:bg-background"
													onclick={() =>
														(form.value.labels = form.value.labels.filter((candidate) => candidate !== label))}
													aria-label={workspace.t('ui.ws.contacts.remove_tag', { tag: label })}
												>
													<X class="size-3" />
												</button>
											</span>
										{/each}
									</div>
									<Input
										id="t-labels"
										bind:value={form.newLabel}
										onkeydown={(event) => event.key === 'Enter' && (event.preventDefault(), form.addLabel())}
										onblur={() => form.addLabel()}
									/>
								</div>
							</FormField>
							<fieldset class="space-y-2">
								<legend class="text-sm font-medium">
									{workspace.t('ui.ws.planner.checklist')}
									{#if form.value.checklist.length > 0}<span class="text-muted-foreground font-normal">
											({doneItems}/{form.value.checklist.length})
										</span>{/if}
								</legend>
								<ul class="space-y-1">
									{#each form.value.checklist as item, index (index)}
										<li class="group flex items-center gap-2 text-sm">
											<Checkbox bind:checked={item.done} aria-label={item.text} />
											<span class="flex-1 {item.done ? 'text-muted-foreground line-through' : ''}">{item.text}</span>
											<button
												type="button"
												class="text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
												onclick={() => form.removeChecklistItem(index)}
												aria-label={workspace.t('ui.ws.delete')}
											>
												<X class="size-3.5" />
											</button>
										</li>
									{/each}
								</ul>
								<Input
									bind:value={form.newItem}
									placeholder={workspace.t('ui.ws.planner.add_item')}
									aria-label={workspace.t('ui.ws.planner.add_item')}
									onkeydown={(event) => event.key === 'Enter' && (event.preventDefault(), form.addChecklistItem())}
								/>
							</fieldset>
						</fieldset>
					</form>
				</Tabs.Content>
				<Tabs.Content value="comments">
					{#if form.original}<CommentThread
							target={{ kind: 'task', id: form.original.id }}
							context={{ label: form.original.title, path: `/planner?task=${form.original.id}` }}
							{people}
						/>{/if}
				</Tabs.Content>
				<Tabs.Content value="files">
					{#if form.original}<AttachmentPanel target={{ kind: 'task', id: form.original.id }} />{/if}
				</Tabs.Content>
				<Tabs.Content value="activity">
					{#if form.original}<ObjectTimeline targetId={form.original.id} {people} />{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>
		{#if tab === 'details'}
			<Sheet.Footer class="flex-row items-center">
				{#if form.original && canWrite}<Button variant="ghost" class="text-destructive mr-auto" onclick={askDelete}>
						<Trash2 class="size-4" />{workspace.t('ui.ws.delete')}
					</Button>{/if}
				<Button variant="outline" onclick={() => close(false)}>{workspace.t('ui.ws.close')}</Button>
				{#if canWrite}<Button type="submit" form="task-form" disabled={form.busy || (!form.dirty && !!form.original)}>
						{workspace.t('ui.save')}
					</Button>{/if}
			</Sheet.Footer>
		{/if}
	</Sheet.Content>
</Sheet.Root>
<ConfirmDialog bind:request={confirm} />
