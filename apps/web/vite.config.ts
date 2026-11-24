/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const artifact = process.env.WORKSPACE_ARTIFACT === '1';

type CspConfig = NonNullable<NonNullable<Parameters<typeof sveltekit>[0]>['csp']>;
type CspSource = NonNullable<NonNullable<CspConfig['directives']>['connect-src']>[number];

/** API, sync and collaboration servers of this build, each also as WebSocket origin. */
function backendOrigins(): CspSource[] {
	const urls = [process.env.VITE_API_URL, process.env.VITE_POWERSYNC_URL, process.env.VITE_COLLAB_URL];
	return urls
		.filter((url): url is string => Boolean(url))
		.flatMap((url) => {
			const origin = new URL(url).origin;
			return [origin, origin.replace(/^http/, 'ws')] as CspSource[];
		});
}

/**
 * Content Security Policy as a <meta> tag with hashes for SvelteKit's inline start script. `https:` stays in
 * connect-src because uploads go straight to signed bucket URLs, and tenants choose their own bucket hosts.
 * frame-ancestors cannot be set by <meta>; Caddy sends it as a header. VITE_CSP_CONNECT adds local origins
 * (such as the RustFS of `pnpm dev:services`) for tests.
 */
const csp: CspConfig = {
	mode: 'hash',
	directives: {
		'default-src': ['self'],
		'script-src': ['self', 'wasm-unsafe-eval'],
		'worker-src': ['self', 'blob:'],
		'style-src': ['self', 'unsafe-inline'],
		'img-src': ['self', 'data:', 'blob:', 'https:'],
		'font-src': ['self', 'data:'],
		'frame-src': ['self', 'data:', 'blob:'],
		'connect-src': [
			'self',
			'https:',
			'wss:',
			...backendOrigins(),
			...((process.env.VITE_CSP_CONNECT?.split(/\s+/).filter(Boolean) ?? []) as CspSource[]),
		],
		'object-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['self'],
	},
};

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		// Static SPA with hash routing: runs from any file host, as a single HTML file, and later inside Tauri.
		sveltekit({
			adapter: adapter({ pages: artifact ? 'build-artifact' : 'build', fallback: '200.html' }),
			router: { type: 'hash' },
			serviceWorker: { register: !artifact && command === 'build' },
			output: { bundleStrategy: artifact ? 'inline' : 'split' },
			// Lets the Updater notice a new deployment; the single-file artifact has no version file and never polls.
			version: { pollInterval: artifact ? 0 : 300_000 },
			// The artifact host wraps the page in its own frame and policy.
			csp: artifact ? undefined : csp,
		}),
	],
	// PowerSync runs SQLite (WASM) in workers; Vite must not pre-bundle it.
	optimizeDeps: { exclude: ['@powersync/web', '@journeyapps/wa-sqlite'] },
	worker: { format: 'es' },
	server: { port: 5176, fs: { allow: ['../..'] } },
	// The single-file artifact carries its fonts as data URIs.
	build: { assetsInlineLimit: artifact ? 10_000_000 : 4096 },
	test: { include: ['test/*.test.ts'], environment: 'node' },
}));
