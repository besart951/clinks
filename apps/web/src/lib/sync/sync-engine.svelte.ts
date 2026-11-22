import type { AbstractPowerSyncDatabase, SyncStatus } from '@powersync/web';
import { recordToRow } from '@clinks/sync-schema/mapping';
import { syncedTableNames, type SyncedTableName } from '@clinks/sync-schema/tables';
import type { ApiClient } from '../data/api-client.ts';
import { ApiConnector } from './connector.ts';

const databaseFile = 'clinks.db';

/**
 * The synced local database (SQLite in the browser). It is opened on first use, so the PowerSync code
 * only loads when the app runs against the real backend, and wiped on sign-out.
 */
export class SyncEngine {
	connected = $state(false);
	uploading = $state(false);
	downloading = $state(false);
	lastSyncedAt = $state<Date | null>(null);
	pendingWrites = $state(0);
	error = $state<string | null>(null);

	readonly #client: ApiClient;
	readonly #endpoint: string;
	readonly #changed: (table: SyncedTableName) => void;
	readonly #rejected: (message: string) => void;
	#database: Promise<AbstractPowerSyncDatabase> | null = null;

	constructor(
		client: ApiClient,
		endpoint: string,
		events: { changed: (table: SyncedTableName) => void; rejected: (message: string) => void },
	) {
		this.#client = client;
		this.#endpoint = endpoint;
		this.#changed = events.changed;
		this.#rejected = events.rejected;
	}

	database(): Promise<AbstractPowerSyncDatabase> {
		this.#database ??= this.#open();
		return this.#database;
	}

	/** Starts syncing with the current access token (and so the current tenant). */
	async connect() {
		const database = await this.database();
		await database.connect(new ApiConnector(this.#client, this.#endpoint, this.#rejected));
	}

	/** After a tenant switch the streams follow the new token. */
	async reconnect() {
		const database = await this.database();
		await database.disconnect();
		await this.connect();
	}

	/** Writes records in one local transaction (uploaded as one), e.g. demo data at onboarding. */
	async insert(table: SyncedTableName, records: readonly { id: string }[]) {
		if (records.length === 0) return;
		const database = await this.database();
		await database.writeTransaction(async (transaction) => {
			for (const record of records) {
				const row = recordToRow(table, record as { id: string; [field: string]: unknown });
				const columns = ['id', ...Object.keys(row)];
				await transaction.execute(
					`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
					[record.id, ...Object.values(row)],
				);
			}
		});
	}

	/** Signs the device out of sync and deletes every synced row from it. */
	async clear() {
		if (!this.#database) return;
		const database = await this.#database;
		await database.disconnectAndClear();
		this.pendingWrites = 0;
		this.lastSyncedAt = null;
	}

	async #open(): Promise<AbstractPowerSyncDatabase> {
		const [{ PowerSyncDatabase }, { powerSyncSchema }] = await Promise.all([
			import('@powersync/web'),
			import('@clinks/sync-schema/powersync-schema.generated'),
		]);
		const database = new PowerSyncDatabase({ schema: powerSyncSchema, database: { dbFilename: databaseFile } });
		database.registerListener({ statusChanged: (status) => void this.#status(database, status) });
		database.onChange(
			{
				onChange: (event) => {
					// Synced rows land in PowerSync's internal tables (ps_data__contacts); local writes in the views.
					const tables = new Set(event.changedTables.map((table) => table.replace(/^ps_data(_local)?__/, '')));
					for (const table of syncedTableNames) if (tables.has(table)) this.#changed(table);
					void this.#countPending(database);
				},
			},
			{ tables: syncedTableNames, throttleMs: 50 },
		);
		await database.init();
		await this.#countPending(database);
		return database;
	}

	async #status(database: AbstractPowerSyncDatabase, status: SyncStatus) {
		this.connected = status.connected;
		this.uploading = status.dataFlowStatus.uploading ?? false;
		this.downloading = status.dataFlowStatus.downloading ?? false;
		this.lastSyncedAt = status.lastSyncedAt ?? this.lastSyncedAt;
		const error = status.dataFlowStatus.downloadError ?? status.dataFlowStatus.uploadError;
		this.error = error ? error.message : null;
		await this.#countPending(database);
	}

	async #countPending(database: AbstractPowerSyncDatabase) {
		this.pendingWrites = (await database.getUploadQueueStats()).count;
	}
}
