import { toast } from 'svelte-sonner';
import type { UserId } from '@clinks/domain/ids';
import type { Task } from '@clinks/domain/types';
import type { Draft } from '@clinks/contracts/repository';
import type { Workspace } from '../../workspace.svelte.ts';

export function emptyTask(): Draft<Task> {
	return {
		title: '',
		description: '',
		status: 'todo',
		priority: 'medium',
		assigneeIds: [],
		dueDate: null,
		labels: [],
		order: 0,
		contactId: null,
		checklist: [],
	};
}

/** Editing one task in the side panel. Saving notifies newly assigned people. */
export class TaskFormModel {
	value = $state<Draft<Task>>(emptyTask());
	original = $state.raw<Task | null>(null);
	busy = $state(false);
	fields = $state<{ [field: string]: string }>({});
	newItem = $state('');
	newLabel = $state('');
	#initial = $state('');
	#workspace: Workspace;

	dirty = $derived(JSON.stringify(this.value) !== this.#initial);

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	start(task: Task | null, preset: Partial<Draft<Task>> = {}) {
		this.original = task;
		const me = this.#workspace.session.user?.id;
		this.value = task
			? structuredClone($state.snapshot(task))
			: { ...emptyTask(), assigneeIds: me ? [me] : [], ...preset };
		this.#initial = JSON.stringify(this.value);
		this.fields = {};
	}

	toggleAssignee(id: UserId) {
		this.value.assigneeIds = this.value.assigneeIds.includes(id)
			? this.value.assigneeIds.filter((candidate) => candidate !== id)
			: [...this.value.assigneeIds, id];
	}

	addChecklistItem() {
		if (!this.newItem.trim()) return;
		this.value.checklist = [...this.value.checklist, { text: this.newItem.trim(), done: false }];
		this.newItem = '';
	}

	removeChecklistItem(index: number) {
		this.value.checklist = this.value.checklist.filter((_, position) => position !== index);
	}

	addLabel() {
		const label = this.newLabel.trim();
		if (label && !this.value.labels.includes(label)) this.value.labels = [...this.value.labels, label];
		this.newLabel = '';
	}

	async save(): Promise<Task | null> {
		this.busy = true;
		this.fields = {};
		const api = this.#workspace.api;
		const draft = $state.snapshot(this.value) as Draft<Task>;
		try {
			const saved = this.original
				? await api.tasks.update(this.original.id, this.original.revision, draft)
				: await api.tasks.create(draft);
			const added = saved.assigneeIds.filter((id) => !(this.original?.assigneeIds ?? []).includes(id));
			if (added.length > 0) {
				await api.notify(
					added,
					'assignment',
					{ key: 'ui.ws.notification.assigned', params: { target: saved.title } },
					`/planner?task=${saved.id}`,
				);
			}
			this.original = saved;
			this.value = structuredClone(saved);
			this.#initial = JSON.stringify(this.value);
			toast.success(this.#workspace.t('ui.ws.planner.saved'));
			return saved;
		} catch (error) {
			this.fields = this.#workspace.fieldErrors(error);
			if (Object.keys(this.fields).length === 0) toast.error(this.#workspace.message(error));
			return null;
		} finally {
			this.busy = false;
		}
	}

	async remove(): Promise<boolean> {
		const original = this.original;
		if (!original) return false;
		const api = this.#workspace.api.tasks;
		return (
			(await this.#workspace.run(() => api.remove(original.id), {
				success: 'ui.ws.planner.deleted',
				undo: () => api.restore(original),
			})) !== null
		);
	}
}
