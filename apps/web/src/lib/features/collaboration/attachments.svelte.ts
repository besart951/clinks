import type { AttachmentTarget, StoredDocument } from '@clinks/domain/types';
import { MockApiError } from '../../data/database.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

import { maxDocumentBytes } from '@clinks/contracts/workspace-schemas';
export const maxUploadBytes = maxDocumentBytes;

/** Uploads one browser file into the tenant document repository. */
export async function uploadDocument(
	workspace: Workspace,
	file: File,
	options: { folderId?: StoredDocument['folderId']; target?: AttachmentTarget },
) {
	if (file.size > maxUploadBytes) throw new MockApiError('validation', workspace.t('error.ws.file_too_large'));
	const dataUrl = await workspace.platform.files.readAsDataUrl(file);
	return workspace.api.documents.create({
		name: file.name,
		folderId: options.folderId ?? null,
		mimeType: file.type || 'application/octet-stream',
		size: file.size,
		dataUrl,
		targets: options.target ? [options.target] : [],
		uploadedBy: workspace.session.user!.id,
		locked: false,
	});
}

export function formatBytes(bytes: number, format: (value: number) => string): string {
	if (bytes < 1024) return `${format(bytes)} B`;
	if (bytes < 1024 * 1024) return `${format(Math.round(bytes / 102.4) / 10)} KB`;
	return `${format(Math.round(bytes / 104857.6) / 10)} MB`;
}

/** Files attached to one record. */
export class AttachmentsModel {
	readonly resource: Resource<StoredDocument[]>;
	uploading = $state(false);
	#workspace: Workspace;
	#target: AttachmentTarget;

	constructor(workspace: Workspace, target: AttachmentTarget) {
		this.#workspace = workspace;
		this.#target = target;
		this.resource = new Resource(workspace.db, ['documents'], () =>
			workspace.api.documents.list((row) =>
				row.targets.some((candidate) => candidate.kind === target.kind && candidate.id === target.id),
			),
		);
	}

	async upload(files: FileList | null) {
		if (!files || files.length === 0) return;
		this.uploading = true;
		for (const file of files) {
			await this.#workspace.run(() => uploadDocument(this.#workspace, file, { target: this.#target }), {
				success: 'ui.ws.documents.uploaded',
				successParams: { name: file.name },
			});
		}
		this.uploading = false;
	}

	async detach(document: StoredDocument) {
		const targets = document.targets.filter(
			(candidate) => !(candidate.kind === this.#target.kind && candidate.id === this.#target.id),
		);
		await this.#workspace.run(() => this.#workspace.api.documents.update(document.id, document.revision, { targets }), {
			success: 'ui.ws.documents.detached',
			successParams: { name: document.name },
		});
	}
}
