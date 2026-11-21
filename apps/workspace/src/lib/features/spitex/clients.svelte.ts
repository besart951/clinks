import { today, toCalendarDate } from '../../domain/dates.ts';
import type { ContactId } from '../../domain/ids.ts';
import type { Appointment, ClinicalNote, Contact, TimeEntry } from '../../domain/types.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export const clientTag = 'Klient:in';

export class ClientsModel {
	readonly resource: Resource<{ client: Contact; next: Appointment | null; perWeek: number }[]>;
	search = $state('');

	constructor(workspace: Workspace) {
		this.resource = new Resource(workspace.db, ['contacts', 'appointments'], async () => {
			const [clients, visits] = await Promise.all([
				workspace.api.contacts.list((row) => row.tags.includes(clientTag) && !row.archived),
				workspace.api.appointments.list((row) => row.kind === 'spitex' && row.status !== 'cancelled'),
			]);
			const now = new Date().toISOString();
			const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
			return clients.map((client) => {
				const own = visits.filter((visit) => visit.contactId === client.id).sort((left, right) => left.start.localeCompare(right.start));
				return { client, next: own.find((visit) => visit.start >= now) ?? null, perWeek: own.filter((visit) => visit.start >= weekAgo && visit.start < now).length };
			});
		});
	}

	get rows() {
		const query = this.search.trim().toLowerCase();
		return (this.resource.data ?? [])
			.filter((row) => !query || `${row.client.firstName} ${row.client.lastName} ${row.client.address.city}`.toLowerCase().includes(query))
			.sort((left, right) => left.client.lastName.localeCompare(right.client.lastName, 'de'));
	}
}

/** A client's file: care documentation and visits. */
export class ClientFileModel {
	readonly resource: Resource<{ client: Contact; visits: Appointment[]; notes: ClinicalNote[] }>;
	draft = $state({ subjective: '', objective: '', assessment: '', plan: '' });
	busy = $state(false);
	#workspace: Workspace;
	#id: ContactId;

	constructor(workspace: Workspace, id: ContactId) {
		this.#workspace = workspace;
		this.#id = id;
		this.resource = new Resource(workspace.db, ['contacts', 'appointments', 'notes'], async () => {
			const [client, visits, notes] = await Promise.all([
				workspace.api.contacts.get(id),
				workspace.api.appointments.list((row) => row.contactId === id),
				workspace.api.spitexNotes.list((row) => row.contactId === id && row.kind === 'spitex'),
			]);
			return {
				client,
				visits: visits.sort((left, right) => right.start.localeCompare(left.start)),
				notes: notes.sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)),
			};
		});
	}

	async addNote() {
		if (!Object.values(this.draft).some((value) => value.trim())) return;
		this.busy = true;
		const result = await this.#workspace.run(
			() => this.#workspace.api.spitexNotes.create({ kind: 'spitex', contactId: this.#id, appointmentId: null, date: today(), authorId: this.#workspace.session.user!.id, ...$state.snapshot(this.draft) }),
			{ success: 'ui.ws.spitex.note_saved' },
		);
		if (result) this.draft = { subjective: '', objective: '', assessment: '', plan: '' };
		this.busy = false;
	}
}

/** Weekly time tracking per person, compared with the planned visit time. */
export class TimeTrackingModel {
	readonly resource: Resource<{ entries: TimeEntry[]; visits: Appointment[] }>;
	date = $state(today());
	minutes = $state(480);
	description = $state('');
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['timeEntries', 'appointments'], async () => {
			const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
			const [entries, visits] = await Promise.all([
				workspace.api.timeEntries.list(),
				workspace.api.appointments.list((row) => row.kind === 'spitex' && row.start >= since && row.status !== 'cancelled'),
			]);
			return { entries: entries.sort((left, right) => right.date.localeCompare(left.date)), visits };
		});
	}

	plannedMinutes(userId: string, date: string) {
		return (this.resource.data?.visits ?? [])
			.filter((visit) => visit.assigneeId === userId && toCalendarDate(visit.start) === date)
			.reduce((sum, visit) => sum + (new Date(visit.end).getTime() - new Date(visit.start).getTime()) / 60_000, 0);
	}

	async add() {
		const userId = this.#workspace.session.user!.id;
		const result = await this.#workspace.run(
			() => this.#workspace.api.timeEntries.create({ userId, appointmentId: null, date: this.date, minutes: Number(this.minutes), description: this.description }),
			{ success: 'ui.ws.spitex.time_saved' },
		);
		if (result) this.description = '';
	}

	async remove(entry: TimeEntry) {
		const api = this.#workspace.api.timeEntries;
		await this.#workspace.run(() => api.remove(entry.id), { success: 'ui.ws.spitex.time_deleted', undo: () => api.restore(entry) });
	}
}
