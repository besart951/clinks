<script lang="ts">
	import * as Sheet from '@clinks/ui/components/ui/sheet';
	import { Button } from '@clinks/ui/components/ui/button';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import TaskMainFields from './TaskMainFields.svelte';
	import TaskMetaFields from './TaskMetaFields.svelte';
	import { TaskFormModel } from '#lib/features/planner/task-form.svelte';
	import type { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import type { Contact, Task } from '@clinks/domain/types';
	import type { Draft } from '@clinks/contracts/repository';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Quick creation of a task. Existing tasks open on their own page (`/planner/<id>`). */
	let {
		contacts,
		people,
		onClose,
		onSaved,
	}: {
		contacts: Contact[];
		people: PeopleDirectory;
		onClose?: () => void;
		onSaved?: (task: Task) => void;
	} = $props();
	const workspace = useWorkspace();
	const form = new TaskFormModel(workspace);
	let open = $state(false);
	let confirm = $state<ConfirmRequest | null>(null);

	export function show(preset: Partial<Draft<Task>> = {}) {
		form.start(null, preset);
		open = true;
	}

	function finish() {
		open = false;
		onClose?.();
	}

	function close(next: boolean) {
		if (next) return;
		if (!form.dirty) return finish();
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
		const saved = await form.save();
		if (!saved) return;
		finish();
		onSaved?.(saved);
	}
</script>

<Sheet.Root {open} onOpenChange={close}>
	<Sheet.Content closeLabel={workspace.t('ui.ws.close')} class="w-full overflow-y-auto sm:max-w-xl">
		<Sheet.Header>
			<Sheet.Title>{workspace.t('ui.ws.command.new_task')}</Sheet.Title>
			<Sheet.Description>{workspace.t('ui.ws.planner.form_text')}</Sheet.Description>
		</Sheet.Header>
		<form id="task-form" class="space-y-4 px-4" onsubmit={submit} novalidate>
			<TaskMainFields {form} />
			<TaskMetaFields {form} {people} {contacts} />
		</form>
		<Sheet.Footer class="flex-row items-center justify-end">
			<Button variant="outline" onclick={() => close(false)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button type="submit" form="task-form" disabled={form.busy}>{workspace.t('ui.save')}</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
<ConfirmDialog bind:request={confirm} />
