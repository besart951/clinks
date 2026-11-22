/** Fields the server owns on every record; clients never send them. */
export type ServerFields = 'id' | 'tenantId' | 'revision' | 'createdAt' | 'updatedAt';

export type Draft<T> = Omit<T, ServerFields>;
export type Patch<T> = Partial<Draft<T>>;

export interface VersionedRecord {
	id: string;
	revision: number;
}

/**
 * The data access every screen depends on. The in-browser mock implements it today; the PowerSync-backed
 * repositories implement it from phase 3. Writes carry the revision they were based on, so stale writes fail
 * with `conflict` instead of overwriting someone else's change.
 */
export interface Repository<Row extends VersionedRecord, D = Draft<Row>, P = Patch<Row>> {
	list(where?: (row: Row) => boolean): Promise<Row[]>;
	get(id: Row['id']): Promise<Row>;
	create(draft: D): Promise<Row>;
	update(id: Row['id'], revision: number, patch: P): Promise<Row>;
	remove(id: Row['id']): Promise<void>;
	restore(record: Row): Promise<Row>;
}

/** The slice of a repository an in-place edit needs. */
export type Patchable<Row extends VersionedRecord, P> = Pick<Repository<Row, unknown, P>, 'get' | 'update'>;
