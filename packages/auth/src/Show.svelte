<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useAuth } from './context.svelte.ts';
	import type { AccessPolicy } from './access.ts';

	let {
		policy,
		children,
		fallback,
	}: {
		policy: AccessPolicy;
		children: Snippet;
		fallback?: Snippet;
	} = $props();
	const auth = useAuth();
	const allowed = $derived(auth.allows(policy));
</script>

{#if allowed}
	{@render children()}
{:else if auth.status !== 'loading' && fallback}
	{@render fallback()}
{/if}
