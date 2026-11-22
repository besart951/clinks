import { newId, type UserId } from '../domain/ids.ts';
import type { AppNotification, Contact, NotificationKind } from '../domain/types.ts';
import { stamp, type MockDatabase } from './database.ts';
import { TenantRepository, type RequestContext } from './repository.ts';
import {
	appointmentSchema,
	campaignSchema,
	commentSchema,
	contactSchema,
	expenseSchema,
	folderSchema,
	invoiceSchema,
	mailSchema,
	noteSchema,
	prescriptionSchema,
	taskSchema,
	templateSchema,
} from './schemas.ts';

export function contactName(contact: Pick<Contact, 'kind' | 'firstName' | 'lastName' | 'companyName'>): string {
	return contact.kind === 'company' ? contact.companyName : `${contact.firstName} ${contact.lastName}`.trim();
}

/** Tenant data of the mock API. Every repository applies the caller's tenant and permissions. */
export class WorkspaceApi {
	readonly contacts: TenantRepository<'contacts'>;
	readonly appointments: TenantRepository<'appointments'>;
	readonly folders: TenantRepository<'folders'>;
	readonly documents: TenantRepository<'documents'>;
	readonly invoices: TenantRepository<'invoices'>;
	readonly expenses: TenantRepository<'expenses'>;
	readonly tasks: TenantRepository<'tasks'>;
	readonly comments: TenantRepository<'comments'>;
	readonly mails: TenantRepository<'mails'>;
	readonly templates: TenantRepository<'templates'>;
	readonly campaigns: TenantRepository<'campaigns'>;
	readonly prescriptions: TenantRepository<'prescriptions'>;
	readonly physioNotes: TenantRepository<'notes'>;
	readonly spitexNotes: TenantRepository<'notes'>;
	readonly timeEntries: TenantRepository<'timeEntries'>;
	readonly audit: TenantRepository<'audit'>;
	readonly notifications: TenantRepository<'notifications'>;
	#db: MockDatabase;
	#context: RequestContext;

	constructor(db: MockDatabase, context: RequestContext) {
		this.#db = db;
		this.#context = context;
		this.contacts = new TenantRepository<'contacts'>(db, context, {
			table: 'contacts',
			read: 'contacts.read',
			write: 'contacts.write',
			schema: contactSchema,
			audit: { kind: 'contact', label: contactName },
		});
		this.appointments = new TenantRepository<'appointments'>(db, context, {
			table: 'appointments',
			read: 'calendar.read',
			write: 'calendar.write',
			schema: appointmentSchema,
			audit: { kind: 'appointment', label: (row) => row.title },
		});
		this.folders = new TenantRepository<'folders'>(db, context, {
			table: 'folders',
			read: 'documents.read',
			write: 'documents.write',
			schema: folderSchema,
		});
		this.documents = new TenantRepository<'documents'>(db, context, {
			table: 'documents',
			read: 'documents.read',
			write: 'documents.write',
			audit: { kind: 'document', label: (row) => row.name },
		});
		this.invoices = new TenantRepository<'invoices'>(db, context, {
			table: 'invoices',
			read: 'finance.read',
			write: 'finance.write',
			schema: invoiceSchema,
			audit: { kind: 'invoice', label: (row) => row.number },
		});
		this.expenses = new TenantRepository<'expenses'>(db, context, {
			table: 'expenses',
			read: 'finance.read',
			write: 'finance.write',
			schema: expenseSchema,
			audit: { kind: 'expense', label: (row) => row.description },
		});
		this.tasks = new TenantRepository<'tasks'>(db, context, {
			table: 'tasks',
			read: 'planner.read',
			write: 'planner.write',
			schema: taskSchema,
			audit: { kind: 'task', label: (row) => row.title },
		});
		this.comments = new TenantRepository<'comments'>(db, context, {
			table: 'comments',
			read: 'contacts.read',
			write: 'contacts.read',
			schema: commentSchema,
		});
		this.mails = new TenantRepository<'mails'>(db, context, {
			table: 'mails',
			read: 'mail.read',
			write: 'mail.write',
			schema: mailSchema,
			audit: { kind: 'mail', label: (row) => row.subject },
		});
		this.templates = new TenantRepository<'templates'>(db, context, {
			table: 'templates',
			read: 'mail.read',
			write: 'mail.write',
			schema: templateSchema,
		});
		this.campaigns = new TenantRepository<'campaigns'>(db, context, {
			table: 'campaigns',
			read: 'mail.read',
			write: 'mail.write',
			schema: campaignSchema,
			audit: { kind: 'campaign', label: (row) => row.name },
		});
		this.prescriptions = new TenantRepository<'prescriptions'>(db, context, {
			table: 'prescriptions',
			read: 'physio.read',
			write: 'physio.write',
			schema: prescriptionSchema,
			audit: { kind: 'prescription', label: (row) => row.diagnosis },
		});
		this.physioNotes = new TenantRepository<'notes'>(db, context, {
			table: 'notes',
			read: 'physio.read',
			write: 'physio.write',
			schema: noteSchema,
			audit: { kind: 'note', label: (row) => row.date },
		});
		this.spitexNotes = new TenantRepository<'notes'>(db, context, {
			table: 'notes',
			read: 'spitex.read',
			write: 'spitex.write',
			schema: noteSchema,
			audit: { kind: 'note', label: (row) => row.date },
		});
		this.timeEntries = new TenantRepository<'timeEntries'>(db, context, {
			table: 'timeEntries',
			read: 'spitex.read',
			write: 'spitex.write',
		});
		this.audit = new TenantRepository<'audit'>(db, context, {
			table: 'audit',
			read: 'contacts.read',
			write: 'audit.read',
		});
		this.notifications = new TenantRepository<'notifications'>(db, context, {
			table: 'notifications',
			read: 'contacts.read',
			write: 'contacts.read',
		});
	}

	/** Lets the server side tell other people about something, like the real API's outbox would. */
	notify(
		userIds: readonly UserId[],
		kind: NotificationKind,
		message: AppNotification['message'],
		href: string,
	): Promise<void> {
		return this.#db.request(() => {
			const tenantId = this.#context.tenantId();
			const actorId = this.#context.actorId();
			if (!tenantId) return;
			for (const userId of new Set(userIds)) {
				if (userId === actorId) continue;
				this.#db
					.table('notifications')
					.push(stamp<AppNotification>({ id: newId(), tenantId, userId, kind, message, href, read: false }));
			}
		}, ['notifications']);
	}

	/** Staff of the tenant that can be assigned or mentioned. */
	people(): Promise<
		{ id: UserId; name: string; email: string; avatarColor: string; avatarDataUrl: string | null; jobTitle: string }[]
	> {
		return this.#db.request(() => {
			const tenantId = this.#context.tenantId();
			const memberships = this.#db
				.table('memberships')
				.filter((row) => row.tenantId === tenantId && row.status === 'active');
			return memberships.flatMap((membership) => {
				const user = this.#db.table('users').find((row) => row.id === membership.userId);
				return user
					? [
							{
								id: user.id,
								name: `${user.firstName} ${user.lastName}`,
								email: user.email,
								avatarColor: user.avatarColor,
								avatarDataUrl: user.avatarDataUrl,
								jobTitle: membership.jobTitle,
							},
						]
					: [];
			});
		});
	}
}
