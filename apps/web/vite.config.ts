/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const artifact = process.env.WORKSPACE_ARTIFACT === '1';

export default defineConfig({
	plugins: [
		tailwindcss(),
		// Static SPA with hash routing: runs from any file host, as a single HTML file, and later inside Tauri.
		sveltekit({
			adapter: adapter({ pages: artifact ? 'build-artifact' : 'build', fallback: '200.html' }),
			router: { type: 'hash' },
			output: { bundleStrategy: artifact ? 'inline' : 'split' },
		}),
	],
	server: { port: 5176, fs: { allow: ['../..'] } },
	// The single-file artifact carries its fonts as data URIs.
	build: { assetsInlineLimit: artifact ? 10_000_000 : 4096 },
	test: { include: ['test/*.test.ts'], environment: 'node' },
});
