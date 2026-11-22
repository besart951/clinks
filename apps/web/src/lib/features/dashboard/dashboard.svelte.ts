import { invoiceTotals, effectiveStatus } from '@clinks/domain/money';
import { addDays, daysBetween, today } from '@clinks/domain/dates';
import type { UserId } from '@clinks/domain/ids';
import { contactName } from '../../data/workspace-api.ts';
import type { Appointment, AuditEntry, Contact, Invoice, Rappen, Task } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export interface SetupStep {
	key: 'logo' | 'contact' | 'appointment' | 'invoice' | 'team' | 'payment';
	done: boolean;
	path: string;
}

/** One actionable notice in the "Hinweise" list. */
export interface DashboardHint {
	kind: 'invoice' | 'task' | 'visit' | 'billing';
	title: string;
	key: string;
	params: { [name: string]: string | number };
	path: string;
}

export interface HintSources {
	invoices: Invoice[];
	tasks: Task[];
	appointments: Appointment[];
	contacts: Map<string, Contact>;
	me: UserId;
	now: Date;
}

/** Things that need someone's attention, most urgent first. */
export function dashboardHints(sources: HintSources): DashboardHint[] {
	const day = today(sources.now);
	const name = (id: string | null) => {
		const contact = id ? sources.contacts.get(id) : undefined;
		return contact ? contactName(contact) : '';
	};
	const overdue: DashboardHint[] = sources.invoices
		.filter((invoice) => ['overdue', 'reminded'].includes(effectiveStatus(invoice, day)))
		.map((invoice) => ({
			kind: 'invoice',
			title: name(invoice.contactId),
			key: 'ui.ws.dashboard.hint_overdue',
			params: { number: invoice.number },
			path: `/finance/invoices/${invoice.id}`,
		}));
	const lateTasks: DashboardHint[] = sources.tasks
		.filter(
			(task) =>
				task.status !== 'done' && task.dueDate !== null && task.dueDate < day && task.assigneeIds.includes(sources.me),
		)
		.map((task) => ({
			kind: 'task',
			title: task.title,
			key: 'ui.ws.dashboard.hint_task_late',
			params: { days: daysBetween(task.dueDate!, day) },
			path: `/planner?task=${task.id}`,
		}));
	const openVisits: DashboardHint[] = sources.appointments
		.filter((entry) => entry.kind === 'spitex' && entry.assigneeId === null && entry.start >= sources.now.toISOString())
		.map((entry) => ({
			kind: 'visit',
			title: name(entry.contactId) || entry.title,
			key: 'ui.ws.dashboard.hint_open_visit',
			params: { date: entry.start },
			path: `/spitex?date=${entry.start.slice(0, 10)}`,
		}));
	const unbilled = new Map<string, number>();
	for (const entry of sources.appointments)
		if (entry.kind === 'physio' && entry.status === 'done' && entry.billedInvoiceId === null && entry.contactId)
			unbilled.set(entry.contactId, (unbilled.get(entry.contactId) ?? 0) + 1);
	const billing: DashboardHint[] = [...unbilled].map(([contactId, count]) => ({
		kind: 'billing',
		title: name(contactId),
		key: 'ui.ws.dashboard.hint_unbilled',
		params: { count },
		path: `/physio/${contactId}`,
	}));
	return [...overdue, ...lateTasks, ...openVisits, ...billing];
}

export interface DashboardData {
	appointmentsToday: Appointment[];
	myTasks: Task[];
	openTaskCount: number;
	unreadMails: number;
	openInvoices: { count: number; total: Rappen; overdue: number };
	activity: AuditEntry[];
	hints: DashboardHint[];
	contacts: Map<string, Contact>;
	setup: SetupStep[];
}

async function optional<T>(enabled: boolean, load: () => Promise<T>, fallback: T): Promise<T> {
	if (!enabled) return fallback;
	try {
		return await load();
	} catch {
		return fallback;
	}
}

const dismissKey = 'clinks.workspace.setup_dismissed';

/** Today at a glance: own appointments, tasks, unread mail, receivables and recent activity. */
export class DashboardModel {
	readonly resource: Resource<DashboardData>;
	setupDismissed = $state(false);
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.setupDismissed = workspace.platform.preferences.read(`${dismissKey}.${workspace.session.tenantId}`, false);
		this.resource = new Resource(
			workspace.db,
			['appointments', 'tasks', 'mails', 'invoices', 'audit', 'contacts', 'tenants', 'invitations'],
			() => this.#load(),
		);
	}

	greeting(now: Date = new Date()): string {
		const hour = now.getHours();
		return hour < 11
			? 'ui.ws.dashboard.good_morning'
			: hour < 17
				? 'ui.ws.dashboard.good_day'
				: 'ui.ws.dashboard.good_evening';
	}

	dismissSetup() {
		this.setupDismissed = true;
		this.#workspace.platform.preferences.write(`${dismissKey}.${this.#workspace.session.tenantId}`, true);
	}

	async #load(): Promise<DashboardData> {
		const { api, session } = this.#workspace;
		const me = session.user!.id;
		const day = today();
		const can = (module: Parameters<typeof session.hasModule>[0], permission: Parameters<typeof session.can>[0]) =>
			session.hasModule(module) && session.can(permission);
		const [appointments, tasks, mails, invoices, activity, contacts, members, attention] = await Promise.all([
			optional(
				can('calendar', 'calendar.read'),
				() =>
					api.appointments.list(
						(row) => row.start.slice(0, 10) >= addDays(day, -1) && row.start.slice(0, 10) <= addDays(day, 1),
					),
				[],
			),
			optional(can('planner', 'planner.read'), () => api.tasks.list(), []),
			optional(can('mail', 'mail.read'), () => api.mails.list((row) => row.folder === 'inbox'), []),
			optional(can('finance', 'finance.read'), () => api.invoices.list(), []),
			optional(session.can('audit.read'), () => api.audit.list(), []),
			optional(session.can('contacts.read'), () => api.contacts.list(), []),
			optional(session.can('team.manage'), () => this.#workspace.account.members(), null),
			optional(
				session.can('calendar.read'),
				() =>
					api.appointments.list(
						(row) =>
							(row.kind === 'physio' && row.status === 'done' && row.billedInvoiceId === null) ||
							(row.kind === 'spitex' && row.assigneeId === null),
					),
				[],
			),
		]);
		const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
		const appointmentsToday = appointments
			.filter((row) => new Date(row.start).toDateString() === new Date().toDateString() && row.status !== 'cancelled')
			.filter((row) => row.assigneeId === me || session.can('calendar.write'))
			.sort((left, right) => left.start.localeCompare(right.start));
		const open = tasks.filter((task) => task.status !== 'done');
		const unpaid = invoices.filter((invoice) =>
			['open', 'partially_paid', 'overdue', 'reminded'].includes(effectiveStatus(invoice, day)),
		);
		const tenant = session.tenant!;
		return {
			appointmentsToday:
				appointmentsToday.filter((row) => row.assigneeId === me).length > 0
					? appointmentsToday.filter((row) => row.assigneeId === me)
					: appointmentsToday.slice(0, 8),
			myTasks: open
				.filter((task) => task.assigneeIds.includes(me))
				.sort((left, right) => (left.dueDate ?? '9999').localeCompare(right.dueDate ?? '9999'))
				.slice(0, 6),
			openTaskCount: open.length,
			unreadMails: mails.filter((mail) => !mail.read).length,
			openInvoices: {
				count: unpaid.length,
				total: unpaid.reduce((sum, invoice) => sum + invoiceTotals(invoice).balance, 0),
				overdue: unpaid.filter((invoice) => ['overdue', 'reminded'].includes(effectiveStatus(invoice, day))).length,
			},
			activity: activity.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 8),
			hints: dashboardHints({
				invoices,
				tasks,
				appointments: attention.filter((row) => row.kind !== 'physio' || session.hasModule('physio')),
				contacts: contactMap,
				me,
				now: new Date(),
			}),
			contacts: contactMap,
			setup: [
				{ key: 'logo', done: tenant.logoDataUrl !== null, path: '/settings' },
				{ key: 'contact', done: contacts.length > 0, path: '/contacts?new=1' },
				{ key: 'appointment', done: appointments.length > 0, path: '/calendar?new=1' },
				{ key: 'invoice', done: invoices.length > 0, path: '/finance/invoices/new' },
				{
					key: 'team',
					done: members === null || members.members.length > 1 || members.invitations.length > 0,
					path: '/settings/team',
				},
				{ key: 'payment', done: tenant.paymentMethod !== null, path: '/settings/billing' },
			],
		};
	}
}
