import type { ZodType } from 'zod';
import { newId, type TenantId, type UserId } from '../domain/ids.ts';
import type { AuditEntry, AuditTargetKind, Permission, TenantRecord } from '../domain/types.ts';
import { MockApiError, stamp, type MockDatabase, type TableName, type Tables } from './database.ts';

export type TenantTable = {
	[Name in TableName]: Tables[Name] extends TenantRecord ? Name : never;
}[TableName];

export type Row<Name extends TableName> = Tables[Name];
export type Draft<T> = Omit<T, 'id' | 'tenantId' | 'revision' | 'createdAt' | 'updatedAt'>;
export type Patch<T> = Partial<Draft<T>>;

/** What the mock server knows about the caller; the real API derives the same from the session cookie. */
export interface RequestContext {
	tenantId(): TenantId | null;
	actorId(): UserId | null;
	can(permission: Permission): boolean;
	localize(key: string): string;
}

export interface RepositoryConfig<T> {
	table: TenantTable;
	read: Permission;
	write: Permission;
	schema?: ZodType;
	audit?: { kind: AuditTargetKind; label(record: T): string };
}

/** Localizes the first issue per field of a failed schema check. */
export function validationError(
	schema: ZodType,
	value: unknown,
	localize: (key: string) => string,
): MockApiError | null {
	const result = schema.safeParse(value);
	if (result.success) return null;
	const fields: { [field: string]: string } = {};
	for (const issue of result.error.issues) {
		const field = issue.path.join('.') || '_';
		fields[field] ??= localize(issue.message.startsWith('error.') ? issue.message : 'error.validation');
	}
	return new MockApiError('validation', localize('error.validation'), fields);
}

/** Tenant-scoped CRUD with permission checks, optimistic revisions and audit entries, like the real API. */
export class TenantRepository<Name extends TenantTable> {
	#db: MockDatabase;
	#context: RequestContext;
	#config: RepositoryConfig<Row<Name>>;

	constructor(db: MockDatabase, context: RequestContext, config: RepositoryConfig<Row<Name>>) {
		this.#db = db;
		this.#context = context;
		this.#config = config;
	}

	list(where: (row: Row<Name>) => boolean = () => true): Promise<Row<Name>[]> {
		return this.#db.request(() => {
			const tenantId = this.#authorize(this.#config.read);
			return this.#rows().filter((row) => row.tenantId === tenantId && where(row));
		});
	}

	get(id: Row<Name>['id']): Promise<Row<Name>> {
		return this.#db.request(() => this.#find(id, this.#authorize(this.#config.read)));
	}

	create(draft: Draft<Row<Name>>): Promise<Row<Name>> {
		return this.#db.request(() => {
			const tenantId = this.#authorize(this.#config.write);
			this.#validate(draft);
			const record = stamp<Row<Name>>({ ...draft, id: newId(), tenantId } as unknown as Row<Name>);
			this.#rows().push(record);
			this.#record('created', record);
			return record;
		}, this.#changed());
	}

	update(id: Row<Name>['id'], revision: number, patch: Patch<Row<Name>>): Promise<Row<Name>> {
		return this.#db.request(() => {
			const tenantId = this.#authorize(this.#config.write);
			const current = this.#find(id, tenantId);
			if (current.revision !== revision) throw new MockApiError('conflict', this.#context.localize('error.conflict'));
			const next = {
				...current,
				...patch,
				id: current.id,
				tenantId,
				revision: current.revision + 1,
				updatedAt: new Date().toISOString(),
			} as Row<Name>;
			this.#validate(next);
			this.#db.replace(this.#config.table, this.#rows().map((row) => (row.id === id ? next : row)) as never);
			this.#record('updated', next);
			return next;
		}, this.#changed());
	}

	remove(id: Row<Name>['id']): Promise<void> {
		return this.#db.request(() => {
			const tenantId = this.#authorize(this.#config.write);
			const current = this.#find(id, tenantId);
			this.#db.replace(this.#config.table, this.#rows().filter((row) => row.id !== id) as never);
			this.#record('deleted', current);
		}, this.#changed());
	}

	/** Puts a removed record back, used by undo. */
	restore(record: Row<Name>): Promise<Row<Name>> {
		return this.#db.request(() => {
			const tenantId = this.#authorize(this.#config.write);
			if (record.tenantId !== tenantId)
				throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
			this.#rows().push(record);
			this.#record('restored', record);
			return record;
		}, this.#changed());
	}

	#rows(): Row<Name>[] {
		return this.#db.table(this.#config.table) as Row<Name>[];
	}

	#changed(): TableName[] {
		return this.#config.audit ? [this.#config.table, 'audit'] : [this.#config.table];
	}

	#authorize(permission: Permission): TenantId {
		const tenantId = this.#context.tenantId();
		if (!tenantId || !this.#context.can(permission)) {
			throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
		}
		return tenantId;
	}

	#find(id: string, tenantId: TenantId): Row<Name> {
		const row = this.#rows().find((candidate) => candidate.id === id && candidate.tenantId === tenantId);
		if (!row) throw new MockApiError('not_found', this.#context.localize('error.ws.not_found'));
		return row;
	}

	#validate(value: unknown) {
		if (!this.#config.schema) return;
		const error = validationError(this.#config.schema, value, (key) => this.#context.localize(key));
		if (error) throw error;
	}

	#record(action: string, record: Row<Name>) {
		const audit = this.#config.audit;
		const actorId = this.#context.actorId();
		if (!audit || !actorId) return;
		appendAudit(this.#db, {
			tenantId: record.tenantId,
			actorId,
			action: `${audit.kind}.${action}`,
			target: { kind: audit.kind, id: record.id, label: audit.label(record) },
		});
	}
}

export function appendAudit(db: MockDatabase, entry: Draft<AuditEntry> & { tenantId: TenantId }) {
	db.table('audit').push(stamp<AuditEntry>({ ...entry, id: newId() }));
}
