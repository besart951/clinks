import type { FolderId } from './ids.ts';
import type { Folder } from './types.ts';

type FolderLink = Pick<Folder, 'id' | 'parentId'>;

/** All folders below `id`, at any depth. */
export function descendantsOf(folders: readonly FolderLink[], id: FolderId): Set<FolderId> {
	const found = new Set<FolderId>();
	const queue = [id];
	while (queue.length > 0) {
		const parent = queue.shift()!;
		for (const folder of folders)
			if (folder.parentId === parent && !found.has(folder.id)) {
				found.add(folder.id);
				queue.push(folder.id);
			}
	}
	return found;
}

/** A folder can move anywhere except into itself, one of its own subfolders, or where it already is. */
export function canMoveFolder(folders: readonly FolderLink[], id: FolderId, parentId: FolderId | null): boolean {
	const folder = folders.find((candidate) => candidate.id === id);
	if (!folder || folder.parentId === parentId) return false;
	return parentId === null || (parentId !== id && !descendantsOf(folders, id).has(parentId));
}

/** The folders from the root down to `id`. */
export function folderPath<T extends FolderLink>(folders: readonly T[], id: FolderId | null): T[] {
	const path: T[] = [];
	let current = folders.find((folder) => folder.id === id);
	while (current && !path.includes(current)) {
		path.unshift(current);
		current = folders.find((folder) => folder.id === current!.parentId);
	}
	return path;
}
