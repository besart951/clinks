import type { TaskId } from '@clinks/domain/ids';
import { orderAt, orderGap, spacedOrders } from '@clinks/domain/ordering';
import { taskStatuses, type Contact, type Task, type TaskPriority, type TaskStatus } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export type PlannerView = 'board' | 'list' | 'calendar';

interface TaskPlacement {
	id: TaskId;
	status: TaskStatus;
	order: number;
}

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

	/**
	 * Moves a task to `index` among the visible cards of a column. Only the moved task gets a new sort key unless
	 * no integer fits between its neighbours; then the whole column is renumbered. Shows an undo toast when the
	 * task changed column.
	 */
	async moveTo(task: Task, status: TaskStatus, index: number, announce = true) {
		const from = { status: task.status, index: this.column(task.status).findIndex((row) => row.id === task.id) };
		const changes = this.#placement(task, status, index);
		if (changes.every((change) => this.#unchanged(change))) return;
		this.#apply(changes);
		const moved = announce && status !== task.status;
		const result = await this.#workspace.run(() => this.#save(changes), {
			success: moved ? 'ui.ws.planner.moved_to' : undefined,
			successParams: { column: this.#workspace.t(`ui.ws.task.status.${status}`) },
			undo: moved
				? async () => {
						const current = this.find(task.id);
						if (current) await this.moveTo(current, from.status, from.index, false);
					}
				: undefined,
		});
		if (result === null) void this.resource.reload(true);
	}

	/** New status and sort key per task for placing `task` at `index` among the visible cards of `status`. */
	#placement(task: Task, status: TaskStatus, index: number): TaskPlacement[] {
		const all = (this.resource.data?.tasks ?? [])
			.filter((row) => row.status === status && row.id !== task.id)
			.sort((left, right) => left.order - right.order);
		const visible = this.column(status).filter((row) => row.id !== task.id);
		// Filters may hide cards: translate the visible position into a position in the whole column.
		const anchor = visible[index];
		const last = visible.at(-1);
		const position = anchor ? all.indexOf(anchor) : last ? all.indexOf(last) + 1 : all.length;
		const order = orderAt(
			all.map((row) => row.order),
			position,
		);
		if (order !== null) return [{ id: task.id, status, order }];
		const ordered = [...all];
		ordered.splice(position, 0, { ...task, status });
		const keys = spacedOrders(ordered.length);
		return ordered.map((row, place) => ({ id: row.id, status, order: keys[place] }));
	}

	#unchanged(change: TaskPlacement) {
		const row = this.find(change.id);
		return row !== null && row.status === change.status && row.order === change.order;
	}

	#apply(changes: TaskPlacement[]) {
		this.resource.patch((data) => ({
			...data,
			tasks: data.tasks.map((row) => {
				const change = changes.find((candidate) => candidate.id === row.id);
				return change ? { ...row, status: change.status, order: change.order } : row;
			}),
		}));
	}

	async #save(changes: TaskPlacement[]) {
		const api = this.#workspace.api.tasks;
		for (const change of changes) {
			const current = await api.get(change.id);
			if (current.status === change.status && current.order === change.order) continue;
			await api.update(current.id, current.revision, { status: change.status, order: change.order });
		}
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
				order: this.#endOrder(status),
				contactId: null,
				checklist: [],
			}),
		);
	}

	#endOrder(status: TaskStatus) {
		const orders = (this.resource.data?.tasks ?? []).filter((row) => row.status === status).map((row) => row.order);
		return orders.length > 0 ? Math.max(...orders) + orderGap : 0;
	}

	async toggleDone(task: Task) {
		const status: TaskStatus = task.status === 'done' ? 'todo' : 'done';
		await this.#workspace.run(() => this.#workspace.api.tasks.update(task.id, task.revision, { status }), {
			success: status === 'done' ? 'ui.ws.planner.completed' : 'ui.ws.planner.reopened',
			successParams: { title: task.title },
		});
	}
}
