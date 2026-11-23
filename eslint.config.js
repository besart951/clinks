import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{
		ignores: [
			'**/node_modules/',
			'apps/mobile/.dart_tool/',
			'apps/mobile/android/',
			'apps/mobile/ios/',
			'apps/desktop/src-tauri/target/',
			'**/.svelte-kit/',
			'**/build/',
			'**/build-artifact/',
			'**/test-results/',
			'**/playwright-report/',
			'docs/',
			'packages/i18n-types/src/product-translation-key.generated.ts',
		],
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			// Hash routing builds links through navigation.ts, which resolve() does not know.
			'svelte/no-navigation-without-resolve': 'off',
			// State lives in rune classes; Map/Set/Date here are immutable values, not reactive containers.
			'svelte/prefer-svelte-reactivity': 'off',
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } },
	},
);
