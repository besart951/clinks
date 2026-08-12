<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { useAuth } from '@clinks/auth';
	import { AuthPortalViewModel, BrowserClipboard, useClinksRuntime } from '@clinks/clinks-runtime';
	import AuthPortal from '@clinks/clinks-views/auth-portal';

	const runtime = useClinksRuntime();
	const auth = useAuth();
	const model = new AuthPortalViewModel(
		'infra_link',
		runtime.client,
		auth,
		runtime.translations,
		new BrowserClipboard(),
	);
	const invitationToken = page.url.searchParams.get('token') ?? '';

	onMount(() => {
		void model.initialize(invitationToken);
	});
</script>

<AuthPortal {model} />
