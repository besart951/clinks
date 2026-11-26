import type { BankEntryView, BankImportView } from '@clinks/contracts/finance';
import type { InvoiceId } from '@clinks/domain/ids';
import type { ApiClient } from './api-client.ts';
import type { WorkspaceApi } from './workspace-api.ts';

/** Bank files (camt.053/054) and the credits still to assign: through the API, or the demo's stand-in. */
export class BankImports {
	readonly #client: ApiClient | null;
	readonly #api: () => WorkspaceApi;
	constructor(client: ApiClient | null, api: () => WorkspaceApi) {
		this.#client = client;
		this.#api = api;
	}

	/** Imports one file read as text; a file imported before comes back with `repeated`. */
	import(file: { name: string; content: string }): Promise<BankImportView> {
		const input = { fileName: file.name, content: file.content };
		return this.#client
			? this.#client.request<BankImportView>('POST', '/finance/bank-imports', input)
			: this.#api().bankImports.import(input);
	}

	imports(): Promise<BankImportView[]> {
		return this.#client
			? this.#client.request<BankImportView[]>('GET', '/finance/bank-imports')
			: this.#api().bankImports.imports();
	}

	openEntries(): Promise<BankEntryView[]> {
		return this.#client
			? this.#client.request<BankEntryView[]>('GET', '/finance/bank-entries')
			: this.#api().bankImports.openEntries();
	}

	assign(entryId: string, invoiceId: InvoiceId): Promise<void> {
		return this.#client
			? this.#client.request<void>('POST', `/finance/bank-entries/${entryId}/assign`, { invoiceId })
			: this.#api().bankImports.assign(entryId, invoiceId);
	}

	ignore(entryId: string): Promise<void> {
		return this.#client
			? this.#client.request<void>('POST', `/finance/bank-entries/${entryId}/ignore`, {})
			: this.#api().bankImports.ignore(entryId);
	}
}
