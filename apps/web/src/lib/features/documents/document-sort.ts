import type { StoredDocument } from '@clinks/domain/types';

export type DocumentSortKey = 'name' | 'size' | 'createdAt';
export interface DocumentSort {
	key: DocumentSortKey;
	dir: 'asc' | 'desc';
}

/** Newest first, as files usually are looked for. */
export const defaultSort: DocumentSort = { key: 'createdAt', dir: 'desc' };

export function sortDocuments(documents: readonly StoredDocument[], sort: DocumentSort): StoredDocument[] {
	const order = sort.dir === 'asc' ? 1 : -1;
	const compare = (left: StoredDocument, right: StoredDocument) => {
		if (sort.key === 'size') return left.size - right.size;
		if (sort.key === 'name') return left.name.localeCompare(right.name, 'de', { numeric: true });
		return left.createdAt.localeCompare(right.createdAt);
	};
	return [...documents].sort(
		(left, right) => compare(left, right) * order || left.name.localeCompare(right.name, 'de'),
	);
}

/** A click on the current column turns the order around; another column starts with its natural order. */
export function nextSort(current: DocumentSort, key: DocumentSortKey): DocumentSort {
	if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
	return { key, dir: key === 'name' ? 'asc' : 'desc' };
}

/** The most recently opened first, without repeats, at most `limit`. */
export function remember<Id>(recent: readonly Id[], id: Id, limit = 8): Id[] {
	return [id, ...recent.filter((entry) => entry !== id)].slice(0, limit);
}
