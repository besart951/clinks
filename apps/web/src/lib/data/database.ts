import type { TenantId } from '@clinks/domain/ids';
import type {
	AppNotification,
	Appointment,
	AuditEntry,
	BaseRecord,
	BrowserSession,
	Campaign,
	ClinicalNote,
	Comment,
	Contact,
	Expense,
	Folder,
	Invitation,
	Invoice,
	MailMessage,
	MailTemplate,
	Membership,
	Prescription,
	Role,
	StoredDocument,
	Task,
	Tenant,
	TimeEntry,
	User,
} from '@clinks/domain/types';

export interface Tables {
	tenants: Tenant;
	users: User;
	roles: Role;
	memberships: Membership;
	invitations: Invitation;
	sessions: BrowserSession;
	contacts: Contact;
	appointments: Appointment;
	folders: Folder;
	documents: StoredDocument;
	invoices: Invoice;
	expenses: Expense;
	tasks: Task;
	comments: Comment;
	mails: MailMessage;
	templates: MailTemplate;
	campaigns: Campaign;
	prescriptions: Prescription;
	notes: ClinicalNote;
	timeEntries: TimeEntry;
	notifications: AppNotification;
	audit: AuditEntry;
}

export type TableName = keyof Tables;
export type Snapshot = { [Name in TableName]: Tables[Name][] };

export const tableNames: readonly TableName[] = [
	'tenants',
	'users',
	'roles',
	'memberships',
	'invitations',
	'sessions',
	'contacts',
	'appointments',
	'folders',
	'documents',
	'invoices',
	'expenses',
	'tasks',
	'comments',
	'mails',
	'templates',
	'campaigns',
	'prescriptions',
	'notes',
	'timeEntries',
	'notifications',
	'audit',
];

export type ErrorCode =
	'validation' | 'not_found' | 'conflict' | 'unauthorized' | 'offline' | 'storage_full' | 'internal';

/** Carries a message that is already localized, like errors from the real API. */
export class MockApiError extends Error {
	readonly code: ErrorCode;
	readonly fields: { [field: string]: string };

	constructor(code: ErrorCode, message: string, fields: { [field: string]: string } = {}) {
		super(message);
		this.name = 'MockApiError';
		this.code = code;
		this.fields = fields;
	}
}

export interface NetworkConditions {
	minLatency: number;
	maxLatency: number;
	failureRate: number;
	offline: boolean;
}

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface DatabaseOptions {
	storage: StorageLike | null;
	seed: () => Snapshot;
	conditions: () => NetworkConditions;
	localize: (key: string) => string;
	random?: () => number;
	sleep?: (milliseconds: number) => Promise<void>;
}

const storageKey = 'clinks.workspace.database.v1';

function defaultSleep(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function emptySnapshot(): Snapshot {
	return Object.fromEntries(tableNames.map((name) => [name, []])) as unknown as Snapshot;
}

/**
 * Local snapshot and table-change subscriptions. The connected workspace caches its authenticated account here.
 */
export class WorkspaceCache {
	#data: Snapshot;
	protected options: Pick<DatabaseOptions, 'seed' | 'storage' | 'localize'>;
	readonly #key: string;
	#listeners = new Set<(table: TableName) => void>();
	#pending = 0;
	#pendingListeners = new Set<(pending: number) => void>();

	constructor(options: Pick<DatabaseOptions, 'seed' | 'storage' | 'localize'>, key = storageKey) {
		this.#key = key;
		this.options = options;
		this.#data = this.#load() ?? options.seed();
		this.#persist();
	}

	get pending() {
		return this.#pending;
	}

	/** Runs one simulated API call. Reads and writes inside `operation` are synchronous and atomic. */
	async request<T>(operation: () => T, changed: readonly TableName[] = []): Promise<T> {
		this.#setPending(this.#pending + 1);
		try {
			await this.beforeRequest(changed);
			const before = changed.length > 0 ? structuredClone(this.#pick(changed)) : null;
			const result = operation();
			if (changed.length > 0) this.#commit(changed, before);
			return structuredClone(result);
		} finally {
			this.#setPending(this.#pending - 1);
		}
	}

	protected async beforeRequest(changed: readonly TableName[]) {
		if (changed.length) throw new MockApiError('validation', this.options.localize('error.ws.unavailable'));
	}

	table<Name extends TableName>(name: Name): Tables[Name][] {
		return this.#data[name];
	}

	replace<Name extends TableName>(name: Name, rows: Tables[Name][]) {
		(this.#data as { [table: string]: unknown })[name] = rows;
	}

	/**
	 * Takes rows a real backend owns (the signed-in account, its tenants and roles) and replaces local rows
	 * with the same id, for the account settings and session snapshot.
	 */
	merge(rows: Partial<Snapshot>) {
		const changed = Object.keys(rows) as TableName[];
		for (const name of changed) {
			const incoming = rows[name] as { id: string }[];
			const ids = new Set(incoming.map((row) => row.id));
			const kept = (this.#data[name] as { id: string }[]).filter((row) => !ids.has(row.id));
			(this.#data as { [table: string]: unknown })[name] = [...kept, ...incoming];
		}
		this.#commit(changed, null);
	}

	removeImported(tenantId: TenantId, imported: ReadonlyMap<TableName, Set<string>>) {
		const tables = [...imported.keys()];
		const before = this.#pick(tables);
		for (const [table, ids] of imported) {
			const rows = this.#data[table].filter(
				(row) => !('tenantId' in row && row.tenantId === tenantId && ids.has(row.id)),
			);
			this.replace(table, rows);
		}
		this.#commit(tables, before);
	}

	/** Tells screens that a table changed elsewhere (e.g. in the synced local database). */
	touch(table: TableName) {
		this.#emit(table);
	}

	on(listener: (table: TableName) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	onPending(listener: (pending: number) => void): () => void {
		this.#pendingListeners.add(listener);
		return () => this.#pendingListeners.delete(listener);
	}

	reset() {
		this.#data = this.options.seed();
		this.#persist();
		for (const name of tableNames) this.#emit(name);
	}

	clear() {
		this.#data = emptySnapshot();
		this.options.storage?.removeItem(this.#key);
	}

	export(): Snapshot {
		return structuredClone(this.#data);
	}

	#pick(names: readonly TableName[]) {
		return Object.fromEntries(names.map((name) => [name, this.#data[name]])) as Partial<Snapshot>;
	}

	#commit(changed: readonly TableName[], before: Partial<Snapshot> | null) {
		try {
			this.#persist();
		} catch {
			if (before) for (const name of changed) (this.#data as { [key: string]: unknown })[name] = before[name];
			throw new MockApiError('storage_full', this.options.localize('error.ws.storage_full'));
		}
		for (const name of changed) this.#emit(name);
	}

	#emit(name: TableName) {
		for (const listener of this.#listeners) listener(name);
	}

	#setPending(value: number) {
		this.#pending = value;
		for (const listener of this.#pendingListeners) listener(value);
	}

	#load(): Snapshot | null {
		const raw = this.options.storage?.getItem(this.#key);
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw) as Partial<Snapshot>;
			const snapshot = emptySnapshot();
			for (const name of tableNames)
				if (Array.isArray(parsed[name])) (snapshot as { [key: string]: unknown })[name] = parsed[name];
			return snapshot;
		} catch {
			return null;
		}
	}

	#persist() {
		this.options.storage?.setItem(this.#key, JSON.stringify(this.#data));
	}
}

export class MockDatabase extends WorkspaceCache {
	readonly #simulation: DatabaseOptions;
	constructor(options: DatabaseOptions) {
		super(options);
		this.#simulation = options;
	}
	protected override async beforeRequest() {
		const conditions = this.#simulation.conditions();
		const random = this.#simulation.random ?? Math.random;
		const latency = conditions.minLatency + random() * Math.max(conditions.maxLatency - conditions.minLatency, 0);
		await (this.#simulation.sleep ?? defaultSleep)(latency);
		if (conditions.offline) throw new MockApiError('offline', this.options.localize('error.ws.offline'));
		if (random() < conditions.failureRate) throw new MockApiError('internal', this.options.localize('error.internal'));
	}
}

export function stamp<T extends BaseRecord>(
	record: Omit<T, 'revision' | 'createdAt' | 'updatedAt'>,
	now = new Date(),
): T {
	const time = now.toISOString();
	return { ...record, revision: 1, createdAt: time, updatedAt: time } as T;
}
