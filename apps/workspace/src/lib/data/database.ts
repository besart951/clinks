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
} from '../domain/types.ts';

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

export type ErrorCode = 'validation' | 'not_found' | 'conflict' | 'unauthorized' | 'offline' | 'storage_full' | 'internal';

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

function emptySnapshot(): Snapshot {
	return Object.fromEntries(tableNames.map((name) => [name, []])) as unknown as Snapshot;
}

/**
 * The backend stand-in: one in-browser data set that survives reloads, answers with simulated latency
 * and can fail on purpose so loading, error and offline states can be tried out.
 */
export class MockDatabase {
	#data: Snapshot;
	#options: DatabaseOptions;
	#listeners = new Set<(table: TableName) => void>();
	#pending = 0;
	#pendingListeners = new Set<(pending: number) => void>();

	constructor(options: DatabaseOptions) {
		this.#options = options;
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
			const conditions = this.#options.conditions();
			const random = this.#options.random ?? Math.random;
			const latency = conditions.minLatency + random() * Math.max(conditions.maxLatency - conditions.minLatency, 0);
			await (this.#options.sleep ?? defaultSleep)(latency);
			if (conditions.offline) throw new MockApiError('offline', this.#options.localize('error.ws.offline'));
			if (random() < conditions.failureRate) throw new MockApiError('internal', this.#options.localize('error.internal'));
			const before = changed.length > 0 ? structuredClone(this.#pick(changed)) : null;
			const result = operation();
			if (changed.length > 0) this.#commit(changed, before);
			return structuredClone(result);
		} finally {
			this.#setPending(this.#pending - 1);
		}
	}

	table<Name extends TableName>(name: Name): Tables[Name][] {
		return this.#data[name];
	}

	replace<Name extends TableName>(name: Name, rows: Tables[Name][]) {
		(this.#data as { [table: string]: unknown })[name] = rows;
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
		this.#data = this.#options.seed();
		this.#persist();
		for (const name of tableNames) this.#emit(name);
	}

	clear() {
		this.#data = emptySnapshot();
		this.#options.storage?.removeItem(storageKey);
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
			throw new MockApiError('storage_full', this.#options.localize('error.ws.storage_full'));
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
		const raw = this.#options.storage?.getItem(storageKey);
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw) as Partial<Snapshot>;
			const snapshot = emptySnapshot();
			for (const name of tableNames) if (Array.isArray(parsed[name])) (snapshot as { [key: string]: unknown })[name] = parsed[name];
			return snapshot.tenants.length > 0 ? snapshot : null;
		} catch {
			return null;
		}
	}

	#persist() {
		this.#options.storage?.setItem(storageKey, JSON.stringify(this.#data));
	}
}

export function stamp<T extends BaseRecord>(record: Omit<T, 'revision' | 'createdAt' | 'updatedAt'>, now = new Date()): T {
	const time = now.toISOString();
	return { ...record, revision: 1, createdAt: time, updatedAt: time } as T;
}
