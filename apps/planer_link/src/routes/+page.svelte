<script lang="ts">
	import { onMount } from 'svelte';
	import { useAuth } from '@clinks/auth';
	import { AuthPortalViewModel, BrowserClipboard, useClinksRuntime } from '@clinks/clinks-runtime';
	import AuthPortal from '@clinks/clinks-views/auth-portal';

	const runtime = useClinksRuntime();
	const auth = useAuth();
	const model = new AuthPortalViewModel(
		'planer_link',
		runtime.client,
		auth,
		runtime.translations,
		new BrowserClipboard(),
	);

	onMount(() => {
		void model.initialize();
	});
</script>

<AuthPortal {model} />
