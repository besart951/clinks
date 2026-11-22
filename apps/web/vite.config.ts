/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const artifact = process.env.WORKSPACE_ARTIFACT === '1';

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
