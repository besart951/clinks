<script lang="ts">
	import { onMount } from 'svelte';
	import { AuthPortalViewModel, BrowserClipboard, useClinksRuntime } from '@clinks/clinks-runtime';
	import AuthPortal from '@clinks/clinks-views/auth-portal';

	const runtime = useClinksRuntime();
	const model = new AuthPortalViewModel('planer_link', runtime.client, runtime.translations, new BrowserClipboard());

	onMount(() => {
		void model.initialize();
	});
</script>

<AuthPortal {model} translations={runtime.translations} theme={runtime.theme} />
