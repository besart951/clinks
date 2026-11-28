import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { publicRoutes, unsubscribeEndpoint, webLink } from '@clinks/contracts/public-links';

const routesDir = fileURLToPath(new URL('../../../web/src/routes/', import.meta.url));
const pages = readdirSync(routesDir, { recursive: true, encoding: 'utf8' })
	.map((path) => path.replaceAll('\\', '/').split('/'))
	.filter((parts) => parts.pop() === '+page.svelte')
	.map((parts) => parts.filter((part) => !part.startsWith('(')));

function hasPage(path: string) {
	const parts = path.split('?')[0].slice(1).split('/');
	return pages.some(
		(page) => page.length === parts.length && page.every((part, i) => part === parts[i] || /^\[\w+\]$/.test(part)),
	);
}

describe('public entry points', () => {
	for (const [name, route] of Object.entries(publicRoutes)) {
		it(name + ' opens an existing web page under the configured base', () => {
			const path = route('sample/a?# &');
			const url = new URL(webLink('https://portal.example/site/?old=1#previous', path));
			expect(url.origin + url.pathname + url.search).toBe('https://portal.example/site/');
			expect(url.hash.slice(1)).toBe(path);
			expect(hasPage(path)).toBe(true);
		});
	}

	it('keeps password reset tokens intact and accepts the legacy route', () => {
		const token = 'ab/+?&#=';
		const path = publicRoutes.passwordReset(token);
		expect(new URLSearchParams(path.split('?')[1]).get('token')).toBe(token);
		expect(hasPage('/reset-password')).toBe(true);
	});

	it('uses an HTTP endpoint on the API host for one-click unsubscribe', () => {
		expect(unsubscribeEndpoint('https://api.example/', 'a/b')).toBe('https://api.example/mail/unsubscribe/a%2Fb');
	});
});
