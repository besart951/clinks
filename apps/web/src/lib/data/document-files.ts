import { newId } from '@clinks/domain/ids';
import type { StoredDocument } from '@clinks/domain/types';
import { maxDocumentBytes } from '@clinks/contracts/workspace-schemas';
import type { ApiClient } from './api-client.ts';
import type { FileStore, OfflineFiles, Platform } from '../platform/types.ts';
import { MockApiError } from './database.ts';
import { bytesOf } from './data-url.ts';
export interface DocumentVersion {
	id: string;
	size: number;
	mimeType: string;
	createdAt: string;
}

/** A version's copy on the device: a new version is a new key. */
function offlineKey(doc: StoredDocument) {
	return `${doc.id}:${doc.dataUrl}`;
}

export class DocumentFiles {
	readonly #client: ApiClient | null;
	readonly #files: FileStore;
	readonly #offline: OfflineFiles;
	readonly #t: (key: string) => string;
	constructor(client: ApiClient | null, platform: Pick<Platform, 'files' | 'offline'>, t: (key: string) => string) {
		this.#client = client;
		this.#files = platform.files;
		this.#offline = platform.offline;
		this.#t = t;
	}
	/** The bytes of the file's current version: the copy on the device when it is kept offline, else downloaded. */
	async blob(doc: StoredDocument) {
		const kept = await this.#offline.get(offlineKey(doc)).catch(() => null);
		if (kept) return new File([kept], doc.name, { type: doc.mimeType });
		return this.#download(doc);
	}
	/** Keeps a copy of the file's current version on the device; files kept inline are there already. */
	async keep(doc: StoredDocument) {
		if (doc.dataUrl.startsWith('data:') || (await this.#offline.get(offlineKey(doc)))) return;
		await this.#offline.put(offlineKey(doc), await this.#download(doc));
	}
	/** Drops the device's copies that are not in `keep` (older versions, files no longer kept offline). */
	async prune(keep: StoredDocument[]) {
		const wanted = new Set(keep.map(offlineKey));
		for (const key of await this.#offline.keys()) if (!wanted.has(key)) await this.#offline.remove(key);
	}
	async #download(doc: StoredDocument) {
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
