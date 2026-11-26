import { newId } from '@clinks/domain/ids';
import type { StoredDocument } from '@clinks/domain/types';
import { maxDocumentBytes } from '@clinks/contracts/workspace-schemas';
import type { ApiClient } from './api-client.ts';
import type { FileStore } from '../platform/types.ts';
import { MockApiError } from './database.ts';
import { bytesOf } from './data-url.ts';
export interface DocumentVersion {
	id: string;
	size: number;
	mimeType: string;
	createdAt: string;
}

export class DocumentFiles {
	readonly #client: ApiClient | null;
	readonly #files: FileStore;
	readonly #t: (key: string) => string;
	constructor(client: ApiClient | null, files: FileStore, t: (key: string) => string) {
		this.#client = client;
		this.#files = files;
		this.#t = t;
	}
	async blob(doc: StoredDocument) {
		const url = doc.dataUrl.startsWith('version:')
			? (
					await this.#client!.request<{ url: string }>(
						'GET',
						`/documents/${doc.id}/versions/${doc.dataUrl.slice(8)}/download`,
					)
				).url
			: doc.dataUrl;
		const bytes = await bytesOf(url).catch(() => {
			throw new MockApiError('offline', this.#t('error.ws.offline'));
		});
		return new File([new Uint8Array(bytes)], doc.name, { type: doc.mimeType });
	}
	async preview(doc: StoredDocument) {
		const file = await this.blob(doc);
		return {
			...doc,
			dataUrl: await this.#files.readAsDataUrl(file),
			text: doc.mimeType.startsWith('text/') ? await file.text() : '',
		};
	}
	async save(doc: StoredDocument) {
		this.#files.save(await this.blob(doc), doc.name);
	}
	versions(doc: StoredDocument) {
		return this.#client!.request<DocumentVersion[]>('GET', `/documents/${doc.id}/versions`);
	}
	async restore(doc: StoredDocument, id: string) {
		await this.#client!.request('POST', `/documents/${doc.id}/versions/${newId()}/commit`, { restoreFrom: id });
	}
	async replace(doc: StoredDocument, file: File) {
		if (file.size > maxDocumentBytes) throw new MockApiError('validation', this.#t('error.ws.file_too_large'));
		const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
		const mimeType = file.type || 'application/octet-stream';
		const base = `/documents/${doc.id}/versions`;
		const { url, id } = await this.#client!.request<{ url: string; id: string }>('POST', base + '/upload', {
			size: file.size,
			mimeType,
			checksum: btoa(String.fromCharCode(...hash)),
		});
		const response = await fetch(url, {
			method: 'PUT',
			body: file,
			headers: { 'Content-Type': mimeType },
			credentials: 'omit',
		});
		if (!response.ok) throw new MockApiError('offline', this.#t('error.ws.offline'));
		await this.#client!.request('POST', base + '/' + id + '/commit', {});
	}
}
