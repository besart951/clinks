import type { UserId } from '@clinks/domain/ids';
import type { AppNotification, CommentTarget, MyVisits, NotificationKind } from '@clinks/domain/types';
import { myVisits } from '@clinks/domain/spitex-release';
import { MockPlanNotices } from './mock-plan-notices.ts';
import { MockInvoiceArchive } from './mock-invoice-archive.ts';
import { MockInvoiceSends } from './mock-invoice-sends.ts';
import { MockBankImports } from './mock-bank-imports.ts';
import { MockMailSettings } from './mock-mail-settings.ts';
import { MockMailOutgoing } from './mock-mail-outgoing.ts';
import type { Repository } from '@clinks/contracts/repository';
import { workspaceSchemas } from '@clinks/contracts/workspace-schemas';
import { syncedTables, type SyncedTableName } from '@clinks/sync-schema/tables';
import { MockApiError, type WorkspaceCache, type Tables } from './database.ts';
import { TenantRepository, type RequestContext, type RepositoryConfig } from './repository.ts';
import type { SyncEngine } from '../sync/sync-engine.svelte.ts';
import { SyncedRepository } from '../sync/synced-repository.ts';
import { workspaceTable, type WorkspaceTable } from './workspace-tables.ts';
import { SyncedWorkspaceReads } from '../sync/workspace-reads.ts';

import { contactName } from '@clinks/domain/contacts';

export { contactName };

export class WorkspaceApi {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;
	readonly #reads: SyncedWorkspaceReads | null;
	readonly contacts;
	readonly appointments;
	readonly folders;
	readonly documents;
	readonly invoices;
	readonly expenses;
	readonly tasks;
	readonly mails;
	readonly templates;
	readonly campaigns;
	readonly prescriptions;
	readonly physioNotes: Pick<Repository<Tables['notes']>, 'list' | 'get' | 'create'>;
	readonly spitexNotes: Pick<Repository<Tables['notes']>, 'list' | 'get' | 'create'>;
	readonly timeEntries;
	readonly weekReleases;
	readonly notifications;
	readonly audit: Pick<Repository<Tables['audit']>, 'list'>;
	/** Demo backend for sending invoices; with the API, `InvoiceDelivery` calls the server instead. */
	readonly invoiceSends: MockInvoiceSends;
	/** Demo backend for bank files; with the API, `BankImports` calls the server instead. */
	readonly bankImports: MockBankImports;
	/** Demo backend for Settings › E-Mail; with the API, `MailSettings` calls the server instead. */
	readonly mailSettings: MockMailSettings;
	/** Demo backend for «Senden»; with the API, `MailOutgoing` calls the server instead. */
	readonly mailOutgoing: MockMailOutgoing;
	readonly #comments;

	constructor(db: WorkspaceCache, context: RequestContext, engine: SyncEngine | null = null) {
		this.#db = db;
		this.#context = context;
		this.#reads = engine ? new SyncedWorkspaceReads(engine, context) : null;
		const plan = new MockPlanNotices(db, context);
		const archive = new MockInvoiceArchive(db, context);
		this.invoiceSends = new MockInvoiceSends(db, context, archive);
		this.bankImports = new MockBankImports(db, context);
		this.mailSettings = new MockMailSettings(db, context);
		this.mailOutgoing = new MockMailOutgoing(db, context);
		function repository<Name extends SyncedTableName>(
			table: Name,
			options: {
				label?: (row: Tables[WorkspaceTable<Name>]) => string;
				visible?: (row: Tables[WorkspaceTable<Name>]) => boolean;
				/** Demo backend only: runs inside the write, like a trigger on the server. */
				after?: (before: Tables[WorkspaceTable<Name>] | null, after: Tables[WorkspaceTable<Name>] | null) => void;
			} = {},
		): Repository<Tables[WorkspaceTable<Name>]> {
			const { label, visible, after } = options;
			const { read, write, audit } = syncedTables[table];
			const schema = workspaceSchemas[table];
			if (engine) return new SyncedRepository(engine, context, { table, read, write, schema, visible });
			const config: RepositoryConfig<Tables[WorkspaceTable<Name>]> = {
				table: workspaceTable(table),
				read,
				write,
				schema,
				visible,
			};
			if (audit && label) config.audit = { kind: audit, label };
			if (after) config.after = { run: after, touches: ['notifications'] };
			return new TenantRepository<WorkspaceTable<Name>>(db, context, config);
		}
		this.contacts = repository('contacts', { label: contactName });
		// Spitex visits are the plan: the calendar permission alone does not show them (see the sync streams).
		this.appointments = repository('appointments', {
			label: (row) => row.title,
			visible: (row) => row.kind !== 'spitex' || context.can('spitex.read'),
			after: (before, after) => plan.visitChanged(before, after),
		});
		this.folders = repository('folders');
		this.documents = repository('documents', { label: (row) => row.name });
		this.invoices = repository('invoices', {
			label: (row) => row.number,
			after: (before, after) => archive.invoiceChanged(before, after),
		});
		this.expenses = repository('expenses', { label: (row) => row.description });
		this.tasks = repository('tasks', { label: (row) => row.title });
		this.mails = repository('mails', { label: (row) => row.subject });
		this.templates = repository('templates');
		this.campaigns = repository('campaigns', { label: (row) => row.name });
		this.prescriptions = repository('prescriptions', { label: (row) => row.diagnosis });
		this.physioNotes = repository('physio_notes', {
			label: (row) => row.date,
			visible: (row) => row.kind === 'physio',
		});
		this.spitexNotes = repository('spitex_notes', {
			label: (row) => row.date,
			visible: (row) => row.kind === 'spitex',
		});
		this.timeEntries = repository('time_entries');
		this.weekReleases = repository('spitex_week_releases', {
			label: (row) => row.weekStart,
			after: (before, after) => plan.releaseChanged(before, after),
		});
		this.notifications = repository('notifications', { visible: (row) => row.userId === context.actorId() });
		this.#comments = {
			contact: repository('contact_comments', { visible: (row) => row.target.kind === 'contact' }),
			invoice: repository('invoice_comments', { visible: (row) => row.target.kind === 'invoice' }),
			task: repository('task_comments', { visible: (row) => row.target.kind === 'task' }),
		};

		const reads = this.#reads;
		this.audit = reads
			? { list: (where) => reads.activity(where) }
			: new TenantRepository<'audit'>(db, context, { table: 'audit', read: 'audit.read', write: 'audit.read' });
	}
	commentsFor(kind: CommentTarget['kind']) {
		return this.#comments[kind];
	}

	async exportTenantData(accountData: Record<string, unknown[]>) {
		if (!this.#reads) return accountData;
		const { tenant, roles, memberships, invitations } = accountData;
		return { tenant, roles, memberships, invitations, ...(await this.#reads.exportModules()) };
	}

	async notify(
		userIds: readonly UserId[],
		kind: NotificationKind,
		message: AppNotification['message'],
		href: string,
	): Promise<void> {
		for (const userId of new Set(userIds)) {
			if (userId !== this.#context.actorId())
				await this.notifications.create({ userId, kind, message, href, read: false });
		}
	}

	/** The caller's own visits in released weeks, with what they need of the clients. */
	myVisits(): Promise<MyVisits> {
		if (this.#reads) return this.#reads.myVisits();
		return this.#db.request(() => {
			const tenantId = this.#context.tenantId();
			const actorId = this.#context.actorId();
			if (!tenantId || !actorId || !this.#context.can('spitex.own.read'))
				throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
			const own = <T extends { tenantId: string }>(rows: T[]) => rows.filter((row) => row.tenantId === tenantId);
			return myVisits(
				{
					appointments: own(this.#db.table('appointments')),
					clients: own(this.#db.table('contacts')),
					releases: own(this.#db.table('weekReleases')),
				},
				actorId,
			);
		});
	}

	/** Staff of the tenant that can be assigned or mentioned. */
	people(): Promise<
		{ id: UserId; name: string; email: string; avatarColor: string; avatarDataUrl: string | null; jobTitle: string }[]
	> {
		if (this.#reads) return this.#reads.people();
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
