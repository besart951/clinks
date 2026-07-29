<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { AuthPortalViewModel, BrowserClipboard, useClinksRuntime } from '@clinks/clinks-runtime';
	import AuthPortal from '@clinks/clinks-views/auth-portal';

	const runtime = useClinksRuntime();
	const model = new AuthPortalViewModel('planer_link', runtime.client, runtime.translations, new BrowserClipboard());
	const invitationToken = page.url.searchParams.get('token') ?? '';

	onMount(() => {
		void model.initialize(invitationToken);
	});
</script>

<AuthPortal {model} translations={runtime.translations} theme={runtime.theme} />
