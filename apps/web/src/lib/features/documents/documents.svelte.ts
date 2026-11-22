import type { FolderId } from '@clinks/domain/ids';
import type { Contact, Folder, StoredDocument } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { uploadDocument } from '../collaboration/attachments.svelte.ts';

export interface DocumentsData {
	folders: Folder[];
	documents: StoredDocument[];
	contacts: Contact[];
}

/** Folder tree and files: upload, preview, rename, move and link to contacts. */
export class DocumentsModel {
	readonly resource: Resource<DocumentsData>;
	folderId = $state<FolderId | null>(null);
	search = $state('');
	uploading = $state(false);
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['folders', 'documents', 'contacts'], async () => {
			const [folders, documents, contacts] = await Promise.all([
				workspace.api.folders.list(),
				workspace.api.documents.list(),
				workspace.session.can('contacts.read') ? workspace.api.contacts.list() : Promise.resolve([]),
			]);
			return { folders, documents, contacts };
		});
	}

	get folders(): Folder[] {
		return [...(this.resource.data?.folders ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'de'));
	}

	get path(): Folder[] {
		const path: Folder[] = [];
		let current = this.folders.find((folder) => folder.id === this.folderId);
		while (current) {
			path.unshift(current);
			current = this.folders.find((folder) => folder.id === current!.parentId);
		}
		return path;
	}

	get children(): Folder[] {
		return this.folders.filter((folder) => folder.parentId === this.folderId);
	}

	get files(): StoredDocument[] {
		const query = this.search.trim().toLowerCase();
		return (this.resource.data?.documents ?? [])
			.filter((document) => (query ? document.name.toLowerCase().includes(query) : document.folderId === this.folderId))
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	}

	count(folderId: FolderId): number {
		return (this.resource.data?.documents ?? []).filter((document) => document.folderId === folderId).length;
	}

	async upload(files: FileList | File[] | null) {
		if (!files || files.length === 0) return;
		this.uploading = true;
		for (const file of files) {
			await this.#workspace.run(() => uploadDocument(this.#workspace, file, { folderId: this.folderId }), {
				success: 'ui.ws.documents.uploaded',
				successParams: { name: file.name },
			});
		}
		this.uploading = false;
	}

	async createFolder(name: string) {
		return this.#workspace.run(
			() => this.#workspace.api.folders.create({ name: name.trim(), parentId: this.folderId }),
			{ success: 'ui.ws.documents.folder_created' },
		);
	}

	async renameFolder(folder: Folder, name: string) {
		return this.#workspace.run(() =>
			this.#workspace.api.folders.update(folder.id, folder.revision, { name: name.trim() }),
		);
	}

	async deleteFolder(folder: Folder) {
		const api = this.#workspace.api;
		const contained = (this.resource.data?.documents ?? []).filter((document) => document.folderId === folder.id);
		const result = await this.#workspace.run(
			async () => {
				for (const document of contained)
					await api.documents.update(document.id, document.revision, { folderId: folder.parentId });
				await api.folders.remove(folder.id);
			},
			{ success: 'ui.ws.documents.folder_deleted', successParams: { name: folder.name } },
		);
		if (result !== null && this.folderId === folder.id) this.folderId = folder.parentId;
	}

	async rename(document: StoredDocument, name: string) {
		return this.#workspace.run(
			() => this.#workspace.api.documents.update(document.id, document.revision, { name: name.trim() }),
			{ success: 'ui.ws.documents.renamed' },
		);
	}

	async move(document: StoredDocument, folderId: FolderId | null) {
		return this.#workspace.run(
			() => this.#workspace.api.documents.update(document.id, document.revision, { folderId }),
			{ success: 'ui.ws.documents.moved' },
		);
	}

	async link(document: StoredDocument, contact: Contact) {
		if (document.targets.some((target) => target.kind === 'contact' && target.id === contact.id)) return;
		return this.#workspace.run(
			() =>
				this.#workspace.api.documents.update(document.id, document.revision, {
					targets: [...document.targets, { kind: 'contact', id: contact.id }],
				}),
			{ success: 'ui.ws.documents.linked' },
		);
	}

	async remove(document: StoredDocument) {
		const api = this.#workspace.api.documents;
		await this.#workspace.run(() => api.remove(document.id), {
			success: 'ui.ws.documents.deleted',
			successParams: { name: document.name },
			undo: () => api.restore(document),
		});
	}
}
