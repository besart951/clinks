import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { FolderId } from '../src/ids.ts';
import { canMoveFolder, descendantsOf, folderPath } from '../src/folders.ts';

const id = (value: string) => value as FolderId;
const folders = [
	{ id: id('a'), parentId: null },
	{ id: id('b'), parentId: id('a') },
	{ id: id('c'), parentId: id('b') },
	{ id: id('d'), parentId: null },
];

describe('folders', () => {
	it('finds every subfolder', () => {
		assert.deepEqual([...descendantsOf(folders, id('a'))].sort(), ['b', 'c']);
	});

	it('never moves a folder into itself or below itself', () => {
		assert.equal(canMoveFolder(folders, id('a'), id('c')), false);
		assert.equal(canMoveFolder(folders, id('a'), id('a')), false);
		assert.equal(canMoveFolder(folders, id('b'), id('a')), false);
		assert.equal(canMoveFolder(folders, id('c'), id('d')), true);
		assert.equal(canMoveFolder(folders, id('c'), null), true);
	});

	it('builds the path from the root', () => {
		assert.deepEqual(
			folderPath(folders, id('c')).map((folder) => folder.id),
			['a', 'b', 'c'],
		);
		assert.deepEqual(folderPath(folders, null), []);
	});
});
