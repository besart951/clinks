import type { Invoice } from '@clinks/domain/types';
import type { ApiClient } from './api-client.ts';
import { bytesOf } from './data-url.ts';
import { MockApiError } from './database.ts';
import type { FileStore } from '../platform/types.ts';
import type { WorkspaceApi } from './workspace-api.ts';

/** The archived PDF/A of an issued invoice: from the API (finance right is enough) or, in the demo, its document. */
export class InvoiceFiles {
	readonly #client: ApiClient | null;
	readonly #files: FileStore;
	readonly #api: () => WorkspaceApi;
	readonly #t: (key: string) => string;
	constructor(client: ApiClient | null, files: FileStore, api: () => WorkspaceApi, t: (key: string) => string) {
		this.#client = client;
		this.#files = files;
		this.#api = api;
		this.#t = t;
	}

	async pdf(invoice: Pick<Invoice, 'id' | 'number' | 'documentId'>): Promise<File> {
		if (!invoice.documentId) throw new MockApiError('not_found', this.#t('error.ws.not_found'));
		const url = this.#client
			? (await this.#client.request<{ url: string }>('GET', `/finance/invoices/${invoice.id}/pdf`)).url
			: (await this.#api().documents.get(invoice.documentId)).dataUrl;
		const bytes = await bytesOf(url).catch(() => {
			throw new MockApiError('offline', this.#t('error.ws.offline'));
		});
		return new File([new Uint8Array(bytes)], `${invoice.number}.pdf`, { type: 'application/pdf' });
	}

	async save(invoice: Pick<Invoice, 'id' | 'number' | 'documentId'>) {
		this.#files.save(await this.pdf(invoice), `${invoice.number}.pdf`);
	}
}
