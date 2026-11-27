import { describe, expect, it } from 'vitest';
import { nextSort, remember, sortDocuments } from '../src/lib/features/documents/document-sort';
import type { StoredDocument } from '@clinks/domain/types';

const doc = (name: string, size: number, createdAt: string) => ({ name, size, createdAt }) as StoredDocument;

describe('document sorting', () => {
	const docs = [
		doc('Bericht 10.pdf', 30, '2026-11-02'),
		doc('Bericht 9.pdf', 10, '2026-11-03'),
		doc('Antrag.pdf', 20, '2026-11-01'),
	];

	it('sorts by name with numbers in order, by size and by date', () => {
		expect(sortDocuments(docs, { key: 'name', dir: 'asc' }).map((entry) => entry.name)).toEqual([
			'Antrag.pdf',
			'Bericht 9.pdf',
			'Bericht 10.pdf',
		]);
		expect(sortDocuments(docs, { key: 'size', dir: 'desc' }).map((entry) => entry.size)).toEqual([30, 20, 10]);
		expect(sortDocuments(docs, { key: 'createdAt', dir: 'desc' })[0].name).toBe('Bericht 9.pdf');
	});

	it('turns the order around on the same column and starts names A–Z', () => {
		expect(nextSort({ key: 'size', dir: 'desc' }, 'size')).toEqual({ key: 'size', dir: 'asc' });
		expect(nextSort({ key: 'size', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
	});

	it('remembers the last opened files without repeats', () => {
		expect(remember(['a', 'b', 'c'], 'b', 3)).toEqual(['b', 'a', 'c']);
		expect(remember(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
	});
});
