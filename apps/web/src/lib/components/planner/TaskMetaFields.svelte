<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Input } from '@clinks/ui/components/ui/input';
	import FormField from '#lib/components/common/FormField.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import ContactPicker from '#lib/components/common/ContactPicker.svelte';
	import PersonAvatar from '#lib/components/common/PersonAvatar.svelte';
	import type { TaskFormModel } from '#lib/features/planner/task-form.svelte';
	import type { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { taskStatuses, type Contact } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * How the task is handled: status, priority, due date, assignees, contact and labels. `narrow` stacks the
	 * three short fields for a side column.
	 */
	let {
		form,
		people,
		contacts,
		narrow = false,
	}: { form: TaskFormModel; people: PeopleDirectory; contacts: Contact[]; narrow?: boolean } = $props();
	const workspace = useWorkspace();
</script>

<div class="grid gap-3 {narrow ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}">
	<FormField id="t-status" label={workspace.t('ui.ws.status')}>
		<Choice
			id="t-status"
			bind:value={form.value.status}
			options={taskStatuses.map((status) => ({ value: status, label: workspace.t(`ui.ws.task.status.${status}`) }))}
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
	<div class={narrow ? 'col-span-2' : ''}>
		<FormField id="t-due" label={workspace.t('ui.ws.planner.due')}>
			<Input
				id="t-due"
				type="date"
				value={form.value.dueDate ?? ''}
				oninput={(event) => (form.value.dueDate = event.currentTarget.value || null)}
			/>
		</FormField>
	</div>
</div>
<fieldset class="space-y-1.5">
	<legend class="text-sm font-medium">{workspace.t('ui.ws.planner.assignees')}</legend>
	<div class="flex flex-wrap gap-1.5">
		{#each people.people as person (person.id)}
			<button
				type="button"
				class="aria-pressed:border-foreground aria-pressed:bg-muted flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs"
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
		{#if form.value.labels.length > 0}
			<div class="flex flex-wrap gap-1">
				{#each form.value.labels as label (label)}
					<span class="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs">
						{label}<button
							type="button"
							class="hover:bg-background rounded-full p-0.5"
							onclick={() => (form.value.labels = form.value.labels.filter((candidate) => candidate !== label))}
							aria-label={workspace.t('ui.ws.contacts.remove_tag', { tag: label })}
						>
							<X class="size-3" />
						</button>
					</span>
				{/each}
			</div>
		{/if}
		<Input
			id="t-labels"
			bind:value={form.newLabel}
			onkeydown={(event) => event.key === 'Enter' && (event.preventDefault(), form.addLabel())}
			onblur={() => form.addLabel()}
		/>
	</div>
</FormField>
