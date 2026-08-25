<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { useAuth } from './context.svelte.ts';

	let { redirectTo, children }: { redirectTo: string; children: Snippet } = $props();
	const auth = useAuth();

	onMount(async () => {
		await auth.initialize();
		if (auth.status === 'authenticated') await auth.continueAfterLogin(redirectTo);
	});
</script>

{#if auth.status === 'anonymous' || auth.status === 'error'}
	{@render children()}
{/if}
