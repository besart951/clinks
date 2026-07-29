/** @type {import("prettier").Config} */
export default {
	printWidth: 120,
	singleQuote: true,
	trailingComma: 'all',
	useTabs: true,
	plugins: ['prettier-plugin-svelte'],
	overrides: [
		{
			files: ['*.json', '*.yaml', '*.yml'],
			options: { useTabs: false },
		},
	],
};
