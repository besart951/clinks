import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'test/e2e',
	timeout: 60_000,
	use: {
		baseURL: 'http://localhost:5176',
		channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
		viewport: { width: 1400, height: 900 },
	},
	webServer: { command: 'pnpm dev --strictPort', port: 5176, reuseExistingServer: true },
});
