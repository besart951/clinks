import { defineConfig } from 'vitest/config';

// Integration tests: they need the dev Postgres (`pnpm dev:services`).
export default defineConfig({
	test: { include: ['test/*.test.ts'], environment: 'node', testTimeout: 20_000, hookTimeout: 60_000 },
});
