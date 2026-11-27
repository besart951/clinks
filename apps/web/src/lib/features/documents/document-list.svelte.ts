import Download from '@lucide/svelte/icons/download';
import Eye from '@lucide/svelte/icons/eye';
import Files from '@lucide/svelte/icons/files';
import FolderIcon from '@lucide/svelte/icons/folder';
import FolderInput from '@lucide/svelte/icons/folder-input';
import History from '@lucide/svelte/icons/history';
import Link2 from '@lucide/svelte/icons/link-2';
import PenLine from '@lucide/svelte/icons/pen-line';
import Trash2 from '@lucide/svelte/icons/trash-2';
import type { DocumentId } from '@clinks/domain/ids';
import type { StoredDocument } from '@clinks/domain/types';
import { ListModel, type ListAction } from '../list/list-model.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import type { DocumentsModel } from './documents.svelte.ts';
import { startItemDrag } from './drag-item.ts';

/** The dialogs the page owns: preview, versions, rename and linking to a contact. */
export interface DocumentListHandlers {
	preview(document: StoredDocument): void;
	versions(document: StoredDocument): void;
	rename(document: StoredDocument): void;
	link(document: StoredDocument): void;
}

/**
 * The file list, as in Explorer: a click marks a file, a double click or Enter opens its preview, Ctrl and
 * Shift pick several. Swiping right downloads, swiping left deletes (with undo).
 */
export function documentList(workspace: Workspace, documents: DocumentsModel, handlers: DocumentListHandlers) {
	const t = workspace.t.bind(workspace);
	const writes = () => workspace.session.can('documents.write');
	const unlocked = (files: StoredDocument[]) => files.every((file) => !file.locked);

	const actions = (): ListAction<StoredDocument>[] => [
		{
			id: 'preview',
			label: () => t('ui.ws.documents.preview'),
			icon: () => Eye,
			single: true,
			run: (files) => handlers.preview(files[0]),
		},
		{
			id: 'download',
			icon: () => Download,
			inline: true,
			label: (files) => t(files.length > 1 ? 'ui.ws.documents.download_zip' : 'ui.ws.documents.download'),
			run: (files) => documents.download(files),
		},
		{
			id: 'versions',
			label: () => t('ui.ws.documents.versions'),
			icon: () => History,
			single: true,
			when: (files) => files[0].dataUrl.startsWith('version:'),
			run: (files) => handlers.versions(files[0]),
		},
		{
			id: 'rename',
			label: () => t('ui.ws.documents.rename'),
			icon: () => PenLine,
			single: true,
			key: 'F2',
			when: (files) => writes() && unlocked(files),
			run: (files) => handlers.rename(files[0]),
		},
		{
			id: 'link',
			label: () => t('ui.ws.documents.link_contact'),
			icon: () => Link2,
			single: true,
			when: writes,
			run: (files) => handlers.link(files[0]),
		},
		{
			id: 'move',
			label: () => t('ui.ws.documents.move_to'),
			icon: () => FolderInput,
			when: writes,
			run: () => undefined,
			choices: (files) =>
				documents.moveTargets({ documents: files }).map((target) => ({
					id: target.id ?? 'root',
					label: target.label,
					icon: target.id === null ? Files : FolderIcon,
					run: () => documents.moveAll(files, target.id),
				})),
		},
		{
			id: 'delete',
			label: () => t('ui.ws.delete'),
			icon: () => Trash2,
			inline: true,
			key: 'Delete',
			destructive: true,
			when: (files) => writes() && unlocked(files),
			run: (files) => documents.remove(files),
		},
	];

	return new ListModel<StoredDocument, DocumentId>({
		t,
		name: () => t('ui.ws.documents.file_list'),
		items: () => documents.files,
		id: (file) => file.id,
		label: (file) => file.name,
		actions,
		open: handlers.preview,
		openOn: 'double',
		swipe: { start: 'download', end: 'delete' },
		drag: (event, file) => {
			if (writes()) startItemDrag(event, { kind: 'document', id: file.id });
		},
	});
}
