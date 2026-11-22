import type { TaskId } from '@clinks/domain/ids';
import { taskStatuses, type Contact, type Task, type TaskPriority, type TaskStatus } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export type PlannerView = 'board' | 'list' | 'calendar';

export interface PlannerData {
	tasks: Task[];
	contacts: Contact[];
}

/** The task board: filters, columns and drag & drop between and within columns. */
export class PlannerModel {
	readonly resource: Resource<PlannerData>;
	view = $state<PlannerView>('board');
	search = $state('');
	onlyMine = $state(false);
	priority = $state<TaskPriority | ''>('');
	label = $state('');
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['tasks', 'contacts'], async () => {
			const [tasks, contacts] = await Promise.all([
				workspace.api.tasks.list(),
				workspace.session.can('contacts.read') ? workspace.api.contacts.list() : Promise.resolve([]),
			]);
			return { tasks, contacts };
		});
	}

	get labels(): string[] {
		return [...new Set((this.resource.data?.tasks ?? []).flatMap((task) => task.labels))].sort();
	}

	get filtered(): Task[] {
		const me = this.#workspace.session.user?.id;
		const query = this.search.trim().toLowerCase();
		return (this.resource.data?.tasks ?? []).filter(
			(task) =>
				(!this.onlyMine || (me !== undefined && task.assigneeIds.includes(me))) &&
				(!this.priority || task.priority === this.priority) &&
				(!this.label || task.labels.includes(this.label)) &&
				(!query || `${task.title} ${task.description}`.toLowerCase().includes(query)),
		);
	}

	column(status: TaskStatus): Task[] {
		return this.filtered.filter((task) => task.status === status).sort((left, right) => left.order - right.order);
	}

	get columns() {
		return taskStatuses.map((status) => ({ status, tasks: this.column(status) }));
	}

	find(id: TaskId | string | null): Task | null {
		return this.resource.data?.tasks.find((task) => task.id === id) ?? null;
	}

	/** Moves a task into a column before another task (or to the end) and renumbers that column. */
	async moveTo(task: Task, status: TaskStatus, beforeId: TaskId | null) {
		const others = this.column(status).filter((candidate) => candidate.id !== task.id);
		const index = beforeId ? others.findIndex((candidate) => candidate.id === beforeId) : -1;
		const ordered = [...others];
		ordered.splice(index === -1 ? ordered.length : index, 0, { ...task, status });
		const changes = ordered
			.map((candidate, position) => ({ candidate, position }))
			.filter(({ candidate, position }) => candidate.order !== position || candidate.id === task.id);
		this.resource.patch((data) => ({
			...data,
			tasks: data.tasks.map((row) => {
				const change = changes.find(({ candidate }) => candidate.id === row.id);
				return change ? { ...row, status: change.candidate.status, order: change.position } : row;
			}),
		}));
		const api = this.#workspace.api.tasks;
		const result = await this.#workspace.run(async () => {
			for (const { candidate, position } of changes) {
				const current = await api.get(candidate.id);
				await api.update(current.id, current.revision, { status: candidate.status, order: position });
			}
		});
		if (result === null) void this.resource.reload(true);
	}

	async quickAdd(title: string, status: TaskStatus) {
		if (!title.trim()) return;
		const me = this.#workspace.session.user?.id;
		await this.#workspace.run(() =>
			this.#workspace.api.tasks.create({
				title: title.trim(),
				description: '',
				status,
				priority: 'medium',
				assigneeIds: me ? [me] : [],
				dueDate: null,
				labels: [],
				order: this.column(status).length,
				contactId: null,
				checklist: [],
			}),
		);
	}

	async toggleDone(task: Task) {
		const status: TaskStatus = task.status === 'done' ? 'todo' : 'done';
		await this.#workspace.run(() => this.#workspace.api.tasks.update(task.id, task.revision, { status }), {
			success: status === 'done' ? 'ui.ws.planner.completed' : 'ui.ws.planner.reopened',
			successParams: { title: task.title },
		});
	}
}
