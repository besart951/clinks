<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import { Checkbox } from '@clinks/ui/components/ui/checkbox';
	import FormField from '#lib/components/common/FormField.svelte';
	import type { TaskFormModel } from '#lib/features/planner/task-form.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** What the task is: title, description and checklist. Shared by the task page and the new-task sheet. */
	let { form, rows = 4 }: { form: TaskFormModel; rows?: number } = $props();
	const workspace = useWorkspace();
	const doneItems = $derived(form.value.checklist.filter((item) => item.done).length);
</script>

<FormField id="t-title" label={workspace.t('ui.ws.calendar.title')} error={form.fields.title}>
	<Input id="t-title" bind:value={form.value.title} aria-invalid={!!form.fields.title} />
</FormField>
<FormField id="t-description" label={workspace.t('ui.ws.planner.description')}>
	<Textarea id="t-description" {rows} bind:value={form.value.description} />
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
