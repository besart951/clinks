import { today } from '../../domain/dates.ts';
import type { UserId } from '../../domain/ids.ts';
import { effectiveStatus } from '../../domain/money.ts';
import type { Appointment, Invoice, MailMessage, Task } from '../../domain/types.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** `attention` badges are orange (something is late or open), `info` badges blue (something new). */
export interface NavBadge {
	count: number;
	tone: 'attention' | 'info';
}

export interface BadgeSources {
	tasks: Task[];
	mails: MailMessage[];
	invoices: Invoice[];
	appointments: Appointment[];
}

/** Counts shown next to the sidebar entries, keyed by navigation path. */
export function badgeCounts(sources: BadgeSources, userId: UserId | null, now: Date): { [path: string]: NavBadge } {
	const day = today(now);
	const timestamp = now.toISOString();
	const mine = sources.tasks.filter((task) => task.status !== 'done' && userId && task.assigneeIds.includes(userId));
	const lateTasks = mine.filter((task) => task.dueDate !== null && task.dueDate < day).length;
	const overdue = sources.invoices.filter((invoice) =>
		['overdue', 'reminded'].includes(effectiveStatus(invoice, day)),
	).length;
	const unbilled = new Set(
		sources.appointments
			.filter((entry) => entry.kind === 'physio' && entry.status === 'done' && entry.billedInvoiceId === null)
			.map((entry) => entry.contactId),
	).size;
	const openVisits = sources.appointments.filter(
		(entry) => entry.kind === 'spitex' && entry.assigneeId === null && entry.start >= timestamp,
	).length;
	const unread = sources.mails.filter((mail) => mail.folder === 'inbox' && !mail.read).length;
	const badges: { [path: string]: NavBadge } = {
		'/planner': { count: lateTasks || mine.length, tone: lateTasks ? 'attention' : 'info' },
		'/mail': { count: unread, tone: 'info' },
		'/finance': { count: overdue, tone: 'attention' },
		'/physio': { count: unbilled, tone: 'attention' },
		'/spitex': { count: openVisits, tone: 'attention' },
	};
	return Object.fromEntries(Object.entries(badges).filter(([, badge]) => badge.count > 0));
}

async function optional<T>(enabled: boolean, load: () => Promise<T[]>): Promise<T[]> {
	if (!enabled) return [];
	try {
		return await load();
	} catch {
		return [];
	}
}

/** Live sidebar counts; reloads whenever one of the source tables changes. */
export class NavBadges {
	readonly resource: Resource<{ [path: string]: NavBadge }>;

	constructor(workspace: Workspace) {
		const { api, session } = workspace;
		const enabled = (module: Parameters<typeof session.hasModule>[0], permission: Parameters<typeof session.can>[0]) =>
			session.hasModule(module) && session.can(permission);
		this.resource = new Resource(workspace.db, ['tasks', 'mails', 'invoices', 'appointments'], async () => {
			const [tasks, mails, invoices, appointments] = await Promise.all([
				optional(enabled('planner', 'planner.read'), () => api.tasks.list()),
				optional(enabled('mail', 'mail.read'), () => api.mails.list()),
				optional(enabled('finance', 'finance.read'), () => api.invoices.list()),
				optional(session.can('calendar.read'), () => api.appointments.list()),
			]);
			return badgeCounts({ tasks, mails, invoices, appointments }, session.user?.id ?? null, new Date());
		});
	}

	get(path: string): NavBadge | undefined {
		return this.resource.data?.[path];
	}
}
