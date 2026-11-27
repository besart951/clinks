import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';

const catalog = JSON.parse(
	readFileSync(new URL('../../../localization/product-catalog.json', import.meta.url), 'utf8'),
);
const keys = new Set(Object.keys(catalog.translations.shared));

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.(svelte|ts)$/.test(name) ? [path] : [];
	});
}

it('uses only catalog keys that exist (a removed key would show up as raw text)', () => {
	const missing = new Set<string>();
	for (const file of sources(new URL('../src', import.meta.url).pathname)) {
		const text = readFileSync(file, 'utf8');
		// Literal keys only: `t('ui.ws.…')`, `success: 'ui.ws.…'`; keys built with `${…}` are checked where they are built.
		for (const match of text.matchAll(/['"`]((?:ui|error|mail)\.[a-z0-9_]+(?:\.[a-z0-9_]+)+)['"`]/g))
			if (!keys.has(match[1])) missing.add(`${match[1]} (${file.split('/src/')[1]})`);
	}
	assert.deepEqual([...missing], []);
});
