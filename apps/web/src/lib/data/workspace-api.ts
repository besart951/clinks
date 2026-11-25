import type { UserId } from '@clinks/domain/ids';
import type { AppNotification, Contact, CommentTarget, MyVisits, NotificationKind } from '@clinks/domain/types';
import { startOfWeek, toCalendarDate } from '@clinks/domain/dates';
import { ownReleasedVisits, visitClient } from '@clinks/domain/spitex-release';
import type { Repository } from '@clinks/contracts/repository';
import { workspaceSchemas } from '@clinks/contracts/workspace-schemas';
import { syncedTables, type SyncedTableName } from '@clinks/sync-schema/tables';
import { MockApiError, type WorkspaceCache, type Tables } from './database.ts';
import { TenantRepository, type RequestContext, type RepositoryConfig } from './repository.ts';
import type { SyncEngine } from '../sync/sync-engine.svelte.ts';
import { SyncedRepository } from '../sync/synced-repository.ts';
import { workspaceTable, type WorkspaceTable } from './workspace-tables.ts';
import { SyncedWorkspaceReads } from '../sync/workspace-reads.ts';

export function contactName(contact: Pick<Contact, 'kind' | 'firstName' | 'lastName' | 'companyName'>): string {
	return contact.kind === 'company' ? contact.companyName : `${contact.firstName} ${contact.lastName}`.trim();
}

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
	readonly #comments;

	constructor(db: WorkspaceCache, context: RequestContext, engine: SyncEngine | null = null) {
		this.#db = db;
		this.#context = context;
		this.#reads = engine ? new SyncedWorkspaceReads(engine, context) : null;
		function repository<Name extends SyncedTableName>(
			table: Name,
			label?: (row: Tables[WorkspaceTable<Name>]) => string,
			visible?: (row: Tables[WorkspaceTable<Name>]) => boolean,
		): Repository<Tables[WorkspaceTable<Name>]> {
			const { read, write, audit } = syncedTables[table];
			const schema = workspaceSchemas[table];
			if (engine) return new SyncedRepository(engine, context, { table, read, write, schema, visible });
			const options: RepositoryConfig<Tables[WorkspaceTable<Name>]> = {
				table: workspaceTable(table),
				read,
				write,
				schema,
				visible,
			};
			if (audit && label) options.audit = { kind: audit, label };
			return new TenantRepository<WorkspaceTable<Name>>(db, context, options);
		}
		this.contacts = repository('contacts', contactName);
		// Spitex visits are the plan: the calendar permission alone does not show them (see the sync streams).
		this.appointments = repository(
			'appointments',
			(row) => row.title,
			(row) => row.kind !== 'spitex' || context.can('spitex.read'),
		);
		this.folders = repository('folders');
		this.documents = repository('documents', (row) => row.name);
		this.invoices = repository('invoices', (row) => row.number);
		this.expenses = repository('expenses', (row) => row.description);
		this.tasks = repository('tasks', (row) => row.title);
		this.mails = repository('mails', (row) => row.subject);
		this.templates = repository('templates');
		this.campaigns = repository('campaigns', (row) => row.name);
		this.prescriptions = repository('prescriptions', (row) => row.diagnosis);
		this.physioNotes = repository(
			'physio_notes',
			(row) => row.date,
			(row) => row.kind === 'physio',
		);
		this.spitexNotes = repository(
			'spitex_notes',
			(row) => row.date,
			(row) => row.kind === 'spitex',
		);
		this.timeEntries = repository('time_entries');
		this.weekReleases = repository('spitex_week_releases', (row) => row.weekStart);
		this.notifications = repository('notifications', undefined, (row) => row.userId === context.actorId());
		this.#comments = {
			contact: repository('contact_comments', undefined, (row) => row.target.kind === 'contact'),
			invoice: repository('invoice_comments', undefined, (row) => row.target.kind === 'invoice'),
			task: repository('task_comments', undefined, (row) => row.target.kind === 'task'),
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
			const releases = this.#db.table('weekReleases').filter((row) => row.tenantId === tenantId);
			const visits = ownReleasedVisits(
				this.#db.table('appointments').filter((row) => row.tenantId === tenantId),
				actorId,
				releases,
				(start) => startOfWeek(toCalendarDate(start)),
			);
			const wanted = new Set(visits.map((visit) => visit.contactId));
			const clients = this.#db
				.table('contacts')
				.filter((row) => row.tenantId === tenantId && wanted.has(row.id))
				.map(visitClient);
			return { visits, clients, releases };
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
