import type { FolderId } from '@clinks/domain/ids';
import type { Contact, Folder, StoredDocument } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { uploadDocument } from '../collaboration/attachments.svelte.ts';
import { canMoveFolder, folderPath } from '@clinks/domain/folders';
import { SvelteSet } from 'svelte/reactivity';
import type { DocumentId } from '@clinks/domain/ids';
import {
	defaultSort,
	nextSort,
	remember,
	sortDocuments,
	type DocumentSort,
	type DocumentSortKey,
} from './document-sort.ts';
import { zipFiles } from './zip.ts';
import { excerpt } from '@clinks/domain/search-text';

/** How the files show: rows with columns, or tiles with a picture. */
export type DocumentView = 'table' | 'cards';

const prefix = 'clinks.workspace.documents.';

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
	/** Open branches of the folder tree. */
	readonly expanded = new SvelteSet<FolderId>();
	/** Kept on the device, like other view settings: order, view, pinned folders and recently opened files. */
	sort = $state<DocumentSort>(defaultSort);
	view = $state<DocumentView>('table');
	pinned = $state<FolderId[]>([]);
	recent = $state<DocumentId[]>([]);
	#workspace: Workspace;
	readonly #pictures = new Map<string, Promise<string>>();

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		const preferences = workspace.platform.preferences;
		this.sort = preferences.read(`${prefix}sort`, defaultSort);
		this.view = preferences.read<DocumentView>(`${prefix}view`, 'table');
		this.pinned = preferences.read<FolderId[]>(`${prefix}pinned`, []);
		this.recent = preferences.read<DocumentId[]>(`${prefix}recent`, []);
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
		return folderPath(this.folders, this.folderId);
	}

	get children(): Folder[] {
		return this.childrenOf(this.folderId);
	}

	childrenOf(parentId: FolderId | null): Folder[] {
		return this.folders.filter((folder) => folder.parentId === parentId);
	}

	/** Opens a folder and unfolds the tree down to it. */
	open(folderId: FolderId | null) {
		this.folderId = folderId;
		this.search = '';
		for (const folder of folderPath(this.folders, folderId)) this.expanded.add(folder.id);
	}

	toggle(folderId: FolderId) {
		if (this.expanded.has(folderId)) this.expanded.delete(folderId);
		else this.expanded.add(folderId);
	}

	canMoveFolder(folder: Folder, parentId: FolderId | null) {
		return canMoveFolder(this.folders, folder.id, parentId);
	}

	async moveFolder(folder: Folder, parentId: FolderId | null) {
		if (!this.canMoveFolder(folder, parentId)) return;
		const result = await this.#workspace.run(
			() => this.#workspace.api.folders.update(folder.id, folder.revision, { parentId }),
			{ success: 'ui.ws.documents.folder_moved', successParams: { name: folder.name } },
		);
		if (result !== null && parentId) this.expanded.add(parentId);
	}

	/** Moves a dragged file or folder (by id) into a folder of the tree. */
	async dropInto(item: { kind: 'document' | 'folder'; id: string }, parentId: FolderId | null) {
		if (item.kind === 'folder') {
			const folder = this.folders.find((candidate) => candidate.id === item.id);
			if (folder) await this.moveFolder(folder, parentId);
			return;
		}
		const document = this.resource.data?.documents.find((candidate) => candidate.id === item.id);
		if (document && document.folderId !== parentId) await this.move(document, parentId);
	}

	get files(): StoredDocument[] {
		const query = this.search.trim().toLowerCase();
		return sortDocuments(
			(this.resource.data?.documents ?? []).filter((document) =>
				query
					? document.name.toLowerCase().includes(query) || !!document.searchText?.toLowerCase().includes(query)
					: document.folderId === this.folderId,
			),
			this.sort,
		);
	}

	/** Where the search found a file by its text (not its name): the words around the match. */
	excerptOf(document: StoredDocument): string | null {
		const query = this.search.trim();
		if (!query || !document.searchText || document.name.toLowerCase().includes(query.toLowerCase())) return null;
		return excerpt(document.searchText, query);
	}

	setSort(key: DocumentSortKey) {
		this.sort = nextSort(this.sort, key);
		this.#keep('sort', this.sort);
	}

	setView(view: DocumentView) {
		this.view = view;
		this.#keep('view', view);
	}

	get pinnedFolders(): Folder[] {
		return this.pinned.flatMap((id) => this.folders.filter((folder) => folder.id === id));
	}

	isPinned(folder: Folder) {
		return this.pinned.includes(folder.id);
	}

	togglePin(folder: Folder) {
		this.pinned = this.isPinned(folder) ? this.pinned.filter((id) => id !== folder.id) : [...this.pinned, folder.id];
		this.#keep('pinned', this.pinned);
	}

	/** The files opened last on this device that still exist, newest first. */
	get recentFiles(): StoredDocument[] {
		const documents = this.resource.data?.documents ?? [];
		return this.recent.flatMap((id) => documents.filter((document) => document.id === id));
	}

	opened(document: StoredDocument) {
		this.recent = remember(this.recent, document.id);
		this.#keep('recent', this.recent);
	}

	/** One file downloads as it is; several as one ZIP archive named after the folder. */
	async download(documents: StoredDocument[]) {
		const files = this.#workspace.documentFiles;
		if (documents.length === 1) return this.#workspace.run(() => files.save(documents[0]));
		return this.#workspace.run(async () => {
			const entries = await Promise.all(
				documents.map(async (document) => ({
					name: document.name,
					bytes: new Uint8Array(await (await files.blob(document)).arrayBuffer()),
					modified: new Date(document.createdAt),
				})),
			);
			const name = this.path.at(-1)?.name ?? this.#workspace.t('ui.ws.documents.all_files');
			this.#workspace.platform.files.save(new Blob([zipFiles(entries)], { type: 'application/zip' }), `${name}.zip`);
		});
	}

	/** A picture of the file for tiles and the preview pane, loaded once per version. */
	picture(document: StoredDocument): Promise<string> {
		const key = `${document.id}:${document.revision}`;
		let picture = this.#pictures.get(key);
		if (!picture) {
			picture = document.dataUrl.startsWith('data:')
				? Promise.resolve(document.dataUrl)
				: this.#workspace.documentFiles.preview(document).then((preview) => preview.dataUrl);
			this.#pictures.set(key, picture);
		}
		return picture;
	}

	#keep(key: string, value: unknown) {
		this.#workspace.platform.preferences.write(`${prefix}${key}`, $state.snapshot(value));
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

	async createFolder(name: string, parentId: FolderId | null = this.folderId) {
		const result = await this.#workspace.run(
			() => this.#workspace.api.folders.create({ name: name.trim(), parentId }),
			{ success: 'ui.ws.documents.folder_created' },
		);
		if (result !== null && parentId) this.expanded.add(parentId);
		return result;
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
				// Files and subfolders move up one level, so deleting a folder never loses anything.
				for (const document of contained)
					await api.documents.update(document.id, document.revision, { folderId: folder.parentId });
				for (const child of this.childrenOf(folder.id))
					await api.folders.update(child.id, child.revision, { parentId: folder.parentId });
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
		return this.moveAll([document], folderId);
	}

	/** Moves files into a folder; the toast offers to put each back where it was. */
	async moveAll(documents: StoredDocument[], folderId: FolderId | null) {
		const api = this.#workspace.api.documents;
		const moving = documents.filter((document) => document.folderId !== folderId);
		if (moving.length === 0) return null;
		return this.#workspace.run(
			async () => {
				for (const document of moving) await api.update(document.id, document.revision, { folderId });
			},
			{
				success: moving.length > 1 ? 'ui.ws.documents.moved_many' : 'ui.ws.documents.moved',
				successParams: { count: moving.length },
				undo: async () => {
					for (const document of moving) {
						const current = await api.get(document.id);
						await api.update(current.id, current.revision, { folderId: document.folderId });
					}
				},
			},
		);
	}

	/**
	 * Where a file or folder can be moved, «All files» first, each folder named with its path. A folder cannot
	 * go into itself or below; files cannot go where they all already are.
	 */
	moveTargets(item: { folder: Folder } | { documents: StoredDocument[] }): { id: FolderId | null; label: string }[] {
		return [
			{ id: null as FolderId | null, label: this.#workspace.t('ui.ws.documents.all_files') },
			...this.folders.map((candidate) => ({
				id: candidate.id as FolderId | null,
				label: folderPath(this.folders, candidate.id)
					.map((part) => part.name)
					.join(' / '),
			})),
		]
			.filter((target) =>
				'folder' in item
					? this.canMoveFolder(item.folder, target.id)
					: item.documents.some((document) => document.folderId !== target.id),
			)
			.sort((left, right) =>
				left.id === null ? -1 : right.id === null ? 1 : left.label.localeCompare(right.label, 'de'),
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

	async remove(documents: StoredDocument[]) {
		const api = this.#workspace.api.documents;
		const removable = documents.filter((document) => !document.locked);
		if (removable.length === 0) return;
		await this.#workspace.run(
			async () => {
				for (const document of removable) await api.remove(document.id);
			},
			{
				success: removable.length > 1 ? 'ui.ws.documents.deleted_many' : 'ui.ws.documents.deleted',
				successParams: { name: removable[0].name, count: removable.length },
				undo: async () => {
					for (const document of removable) await api.restore(document);
				},
			},
		);
	}
}
