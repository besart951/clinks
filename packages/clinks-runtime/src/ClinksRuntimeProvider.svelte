<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { createClient, type ApplicationScope } from '@clinks/api-client';
	import { BrowserPreferences } from './browser-preferences';
	import { setClinksRuntime } from './context.svelte';
	import { SessionStore } from './session-store.svelte';
	import { ThemeViewModel } from './theme-view-model.svelte';
	import { TranslationBundleViewModel } from './translation-bundle-view-model.svelte';

	let {
		applicationScope,
		children,
	}: {
		applicationScope: ApplicationScope;
		children: Snippet;
	} = $props();

	const preferences = new BrowserPreferences();
	let translations!: TranslationBundleViewModel;
	const client = createClient({
		baseURL: import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080',
		locale: () => translations.locale,
		applicationScope: () => applicationScope,
	});
	translations = new TranslationBundleViewModel(client, preferences);
	const theme = new ThemeViewModel(preferences);
	const session = new SessionStore(client);

	setClinksRuntime({ client, theme, translations, session });

	onMount(() => {
		theme.initialize();
		void translations.initialize();
		return () => theme.dispose();
	});
</script>

{@render children()}
