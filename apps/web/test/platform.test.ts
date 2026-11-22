import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { StoragePreferences, StorageSecrets, type KeyValueStorage } from '../src/lib/platform/web-storage.ts';
import { rememberSection, sectionOpen } from '../src/lib/components/kit/section-memory.ts';

function memoryStorage(): KeyValueStorage & { items: Map<string, string> } {
	const items = new Map<string, string>();
	return {
		items,
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
		removeItem: (key) => void items.delete(key),
	};
}

const brokenStorage: KeyValueStorage = {
	getItem: () => {
		throw new Error('SecurityError');
	},
	setItem: () => {
		throw new Error('QuotaExceededError');
	},
	removeItem: () => {
		throw new Error('SecurityError');
	},
};

describe('web platform storage', () => {
	it('round-trips JSON preferences and falls back on missing or corrupt values', () => {
		const storage = memoryStorage();
		const preferences = new StoragePreferences(storage);
		assert.equal(preferences.read('theme', 'system'), 'system');
		preferences.write('theme', 'dark');
		assert.equal(preferences.read('theme', 'system'), 'dark');
		storage.items.set('broken', '{not json');
		assert.deepEqual(preferences.read('broken', { a: 1 }), { a: 1 });
		preferences.remove('theme');
		assert.equal(storage.items.has('theme'), false);
	});

	it('never throws when storage is unavailable or full', () => {
		const preferences = new StoragePreferences(brokenStorage);
		const secrets = new StorageSecrets(brokenStorage);
		assert.equal(preferences.read('x', 7), 7);
		assert.doesNotThrow(() => preferences.write('x', 1));
		assert.equal(secrets.read('token'), null);
		assert.doesNotThrow(() => secrets.write('token', 'abc'));
		assert.equal(new StoragePreferences(null).read('x', 'fallback'), 'fallback');
	});

	it('remembers open accordion sections per id', () => {
		const preferences = new StoragePreferences(memoryStorage());
		assert.equal(sectionOpen(preferences, 'contact.master', true), true);
		rememberSection(preferences, 'contact.master', false);
		rememberSection(preferences, 'contact.notes', true);
		assert.equal(sectionOpen(preferences, 'contact.master', true), false);
		assert.equal(sectionOpen(preferences, 'contact.notes', false), true);
	});
});
