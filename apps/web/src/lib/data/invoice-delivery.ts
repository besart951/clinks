import type { InvoiceLinkDetails, InvoiceLinkFile, InvoiceSendInput } from '@clinks/contracts/finance';
import type { InvoiceId } from '@clinks/domain/ids';
import type { InvoiceSend } from '@clinks/domain/types';
import type { ApiClient } from './api-client.ts';
import { bytesOf } from './data-url.ts';
import { MockApiError } from './database.ts';
import type { FileStore } from '../platform/types.ts';
import type { WorkspaceApi } from './workspace-api.ts';

/**
 * Sending invoices by e-mail and the recipient's secure link: through the API, or in the demo through its
 * stand-in, which files the mail under Mail › Gesendet.
 */
export class InvoiceDelivery {
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

	/** True in the demo: the log can offer the link the recipient would get. */
	get demo() {
		return this.#client === null;
	}

	send(invoiceId: InvoiceId, input: InvoiceSendInput): Promise<InvoiceSend> {
		return this.#client
			? this.#client.request<InvoiceSend>('POST', `/finance/invoices/${invoiceId}/send`, input)
			: this.#api().invoiceSends.send(invoiceId, input);
	}

	sends(invoiceId: InvoiceId): Promise<InvoiceSend[]> {
		return this.#client
			? this.#client.request<InvoiceSend[]>('GET', `/finance/invoices/${invoiceId}/sends`)
			: this.#api().invoiceSends.list(invoiceId);
	}

	demoLink(send: InvoiceSend): string | null {
		return this.#client ? null : this.#api().invoiceSends.demoLink(send.id);
	}

	linkDetails(token: string): Promise<InvoiceLinkDetails> {
		return this.#client
			? this.#client.request<InvoiceLinkDetails>('GET', `/invoice-links/${encodeURIComponent(token)}`)
			: this.#api().invoiceSends.linkDetails(token);
	}

	/** Opens the file behind a secure link with the postcode and saves it on the device. */
	async open(token: string, postcode: string) {
		const file = this.#client
			? await this.#client.request<InvoiceLinkFile>('POST', `/invoice-links/${encodeURIComponent(token)}`, {
					postcode,
				})
			: await this.#api().invoiceSends.open(token, postcode);
		const bytes = await bytesOf(file.url).catch(() => {
			throw new MockApiError('offline', this.#t('error.ws.offline'));
		});
		this.#files.save(new File([new Uint8Array(bytes)], file.name, { type: 'application/pdf' }), file.name);
		return file.name;
	}
}
