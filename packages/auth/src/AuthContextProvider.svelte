<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { AuthStore, type Navigate } from './auth-store.svelte.ts';
	import { setAuth } from './context.svelte.ts';

	let { navigate, children }: { navigate: Navigate; children: Snippet } = $props();
	const runtime = useClinksRuntime();
	const auth = new AuthStore(runtime.client, (target) => navigate(target));

	setAuth(auth);
	runtime.client.setUnauthenticatedHandler(() => auth.invalidate());

	onMount(() => {
		void auth.initialize();
	});

	onDestroy(() => {
		runtime.client.setUnauthenticatedHandler();
	});
</script>

{@render children()}
