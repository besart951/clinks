import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/web';
import type { ApiClient } from '../data/api-client.ts';
import { MockApiError } from '../data/database.ts';

/**
 * Connects the local database to the CLinks backend: PowerSync downloads with the API's access token,
 * and local writes go up to the API one local transaction at a time.
 */
export class ApiConnector implements PowerSyncBackendConnector {
	readonly #client: ApiClient;
	readonly #endpoint: string;
	readonly #onRejected: (message: string) => void;

	constructor(client: ApiClient, endpoint: string, onRejected: (message: string) => void) {
		this.#client = client;
		this.#endpoint = endpoint;
		this.#onRejected = onRejected;
	}

	async fetchCredentials() {
		const token = await this.#client.accessToken();
		return token ? { endpoint: this.#endpoint, token } : null;
	}

	/**
	 * A rejected transaction (invalid, not allowed, conflicting) is dropped: retrying cannot fix it, and the
	 * next sync puts the server's version back. Offline and server errors are retried by PowerSync.
	 */
	async uploadData(database: AbstractPowerSyncDatabase) {
		for (
			let transaction = await database.getNextCrudTransaction();
			transaction;
			transaction = await database.getNextCrudTransaction()
		) {
			const ops = transaction.crud.map((entry) => ({
				op: entry.op,
				table: entry.table,
				id: entry.id,
				data: entry.opData,
			}));
			try {
				await this.#client.request('POST', '/sync/write', { ops });
			} catch (error) {
				if (
					!(error instanceof MockApiError) ||
					!['validation', 'unauthorized', 'conflict', 'not_found'].includes(error.code)
				)
					throw error;
				this.#onRejected(error.message);
			}
			await transaction.complete();
		}
	}
}
