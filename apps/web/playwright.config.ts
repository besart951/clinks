import { defineConfig } from '@playwright/test';

// `pnpm test:e2e` runs the prototype against the in-browser mock; `pnpm test:e2e:remote` runs the sign-in
// flows against the real API (needs `pnpm dev:services` and `pnpm dev:api`).
const remote = Boolean(process.env.VITE_API_URL);

export default defineConfig({
	testDir: 'test/e2e',
	testMatch: '*.spec.ts',
	testIgnore: remote ? ['workspace.spec.ts', 'mobile.spec.ts'] : 'remote.spec.ts',
	timeout: 60_000,
	use: {
		baseURL: 'http://localhost:5176',
		channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
		viewport: { width: 1400, height: 900 },
	},
	// Exercise the same compiled SPA as users. Dev-server dependency discovery can reload the first page.
	webServer: {
		command: 'pnpm build && pnpm preview --port 5176 --strictPort',
		port: 5176,
		reuseExistingServer: false,
		timeout: 180_000,
	},
});
