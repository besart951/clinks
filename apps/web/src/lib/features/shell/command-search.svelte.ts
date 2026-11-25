import { contactName } from '../../data/workspace-api.ts';
import { addDays, today } from '@clinks/domain/dates';
import type { Workspace } from '../../workspace.svelte.ts';
import { allNavigationItems } from './navigation-items.ts';

export interface CommandEntry {
	id: string;
	group: 'actions' | 'pages' | 'contacts' | 'appointments' | 'invoices' | 'tasks' | 'mails';
	label: string;
	detail: string;
	path: string;
	/** Opens a create sheet on the current page instead of going to `path`. */
	create?: 'appointment' | 'task' | 'mail';
}

/** Collects everything the command palette can jump to; each source respects the caller's rights. */
export class CommandSearch {
	entries = $state.raw<CommandEntry[]>([]);
	loading = $state(false);
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	async load() {
		this.loading = true;
		const w = this.#workspace;
		const session = w.session;
		const actions = (
			[
				['new-contact', 'ui.ws.command.new_contact', '/contacts?new=1', 'contacts', undefined],
				['new-appointment', 'ui.ws.command.new_appointment', '/calendar?new=1', 'calendar', 'appointment'],
				['new-task', 'ui.ws.command.new_task', '/planner?new=1', 'planner', 'task'],
				['new-mail', 'ui.ws.command.new_mail', '/mail?compose=1', 'mail', 'mail'],
				['new-invoice', 'ui.ws.command.new_invoice', '/finance/invoices/new', 'finance', undefined],
			] as const
		)
			.filter(([, , , module]) => session.hasModule(module))
			.map(([id, label, path, , create]) => ({
				id,
				group: 'actions' as const,
				label: w.t(label),
				detail: '',
				path,
				create,
			}));
		const pages = allNavigationItems
			.filter(
				(item) =>
					(!item.permission || session.can(item.permission)) && (!item.module || session.hasModule(item.module)),
			)
			.map((item) => ({
				id: `page-${item.path}`,
				group: 'pages' as const,
				label: w.t(item.label),
				detail: '',
				path: item.path,
			}));
		const optional = async <T>(enabled: boolean, load: () => Promise<T[]>): Promise<T[]> => {
			if (!enabled) return [];
			try {
				return await load();
			} catch {
				return [];
			}
		};
		const until = addDays(today(), 30);
		const [contacts, appointments, invoices, tasks, mails] = await Promise.all([
			optional(session.can('contacts.read'), () => w.api.contacts.list((row) => !row.archived)),
			optional(session.can('calendar.read'), () =>
				w.api.appointments.list((row) => row.start.slice(0, 10) >= today() && row.start.slice(0, 10) <= until),
			),
			optional(session.can('finance.read') && session.hasModule('finance'), () => w.api.invoices.list()),
			optional(session.can('planner.read') && session.hasModule('planner'), () => w.api.tasks.list()),
			optional(session.can('mail.read') && session.hasModule('mail'), () => w.api.mails.list()),
		]);
		this.entries = [
			...actions,
			...pages,
			...contacts.map((row) => ({
				id: row.id,
				group: 'contacts' as const,
				label: contactName(row),
				detail: row.email || row.address.city,
				path: `/contacts/${row.id}`,
			})),
			...appointments.slice(0, 60).map((row) => ({
				id: row.id,
				group: 'appointments' as const,
				label: row.title,
				detail: w.i18n.dateTime(row.start),
				path: `/calendar?date=${row.start.slice(0, 10)}&appointment=${row.id}`,
			})),
			...invoices.map((row) => ({
				id: row.id,
				group: 'invoices' as const,
				label: row.number,
				detail: w.i18n.date(row.issueDate),
				path: `/finance/invoices/${row.id}`,
			})),
			...tasks.map((row) => ({
				id: row.id,
				group: 'tasks' as const,
				label: row.title,
				detail: '',
				path: `/planner/${row.id}`,
			})),
			...mails.map((row) => ({
				id: row.id,
				group: 'mails' as const,
				label: row.subject,
				detail: row.fromName,
				path: `/mail?message=${row.id}`,
			})),
		];
		this.loading = false;
	}
}
