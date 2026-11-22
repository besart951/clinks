import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import type { Services } from './services/context.ts';

// Writes the OpenAPI document to packages/contracts, for clients in other languages (Dart later).
// Building the routes does not touch the services, so none are needed here.
const app = createApp({
	services: {} as Services,
	config: { WEB_ORIGIN: 'http://localhost', COOKIE_SECURE: true, TRUST_PROXY: false },
});
const document = app.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'CLinks API', version: '0.1.0' } });
const target = fileURLToPath(new URL('../../../packages/contracts/openapi.json', import.meta.url));
const content = `${JSON.stringify(document, null, '\t')}\n`;
if (process.argv.includes('--check')) {
	const current = await readFile(target, 'utf8').catch(() => '');
	if (current !== content) {
		console.error('packages/contracts/openapi.json is out of date: run `pnpm --filter @clinks/api openapi`.');
		process.exit(1);
	}
} else {
	await writeFile(target, content);
	console.log(`wrote ${target}`);
}
