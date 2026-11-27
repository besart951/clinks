import type {
	DocumentShareCreated,
	DocumentShareView,
	SharedFile,
	SharedFileDetails,
} from '@clinks/contracts/documents';
import type { ApiClient } from './api-client.ts';
import type { WorkspaceApi } from './workspace-api.ts';

/** «Teilen-Link» through the API or the demo's stand-in: made and ended in the workspace, opened without an account. */
export class DocumentShares {
	readonly #client: ApiClient | null;
	readonly #api: () => WorkspaceApi;
	constructor(client: ApiClient | null, api: () => WorkspaceApi) {
		this.#client = client;
		this.#api = api;
	}

	list(documentId: string): Promise<DocumentShareView[]> {
		return this.#client
			? this.#client.request<DocumentShareView[]>('GET', `/documents/${documentId}/shares`)
			: this.#api().documentShares.list(documentId);
	}

	create(documentId: string, days: 1 | 7 | 30): Promise<DocumentShareCreated> {
		return this.#client
			? this.#client.request<DocumentShareCreated>('POST', `/documents/${documentId}/shares`, { days })
			: this.#api().documentShares.create(documentId, days);
	}

	revoke(shareId: string): Promise<void> {
		return this.#client
			? this.#client.request<void>('DELETE', `/document-shares/${shareId}`)
			: this.#api().documentShares.revoke(shareId);
	}

	details(token: string): Promise<SharedFileDetails> {
		return this.#client
			? this.#client.request<SharedFileDetails>('GET', `/shares/${encodeURIComponent(token)}`)
			: this.#api().documentShares.details(token);
	}

	open(token: string): Promise<SharedFile> {
		return this.#client
			? this.#client.request<SharedFile>('POST', `/shares/${encodeURIComponent(token)}`)
			: this.#api().documentShares.open(token);
	}
}
