import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const artifact = process.env.WORKSPACE_ARTIFACT === '1';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: { port: 5176, fs: { allow: ['../..'] } },
	// The single-file artifact carries its fonts as data URIs.
	build: { assetsInlineLimit: artifact ? 10_000_000 : 4096 },
});
