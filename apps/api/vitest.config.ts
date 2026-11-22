import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: [
			{ test: { name: 'unit', include: ['test/unit/*.test.ts'], environment: 'node' } },
			// Needs the dev Postgres (`pnpm dev:services`); each file gets its own fresh database.
			{
				test: {
					name: 'integration',
					include: ['test/integration/*.test.ts'],
					environment: 'node',
					testTimeout: 30_000,
					hookTimeout: 60_000,
				},
			},
		],
	},
});
