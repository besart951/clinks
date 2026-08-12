<script lang="ts">
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import type { Snippet } from 'svelte';
	import type { AccessPolicy } from './access.ts';
	import { useAuth } from './context.svelte.ts';
	import type { GuardFeedback } from './guard.ts';

	let {
		policy,
		redirectTo,
		children,
		feedback,
	}: {
		policy: AccessPolicy;
		redirectTo?: string;
		children: Snippet;
		feedback?: GuardFeedback;
	} = $props();
	const auth = useAuth();
	const runtime = useClinksRuntime();
	const allowed = $derived(auth.allows(policy));
	let redirecting = false;

	$effect(() => {
		if (auth.status !== 'authenticated' || allowed || !redirectTo) {
			redirecting = false;
			return;
		}
		if (redirecting) return;
		redirecting = true;
		void auth.navigate(redirectTo);
	});
</script>

{#if auth.status === 'authenticated' && allowed}
	{@render children()}
{:else if auth.status === 'loading'}
	{#if feedback?.loading}{@render feedback.loading()}{:else}<p aria-live="polite">
			{runtime.translations.t('ui.loading')}
		</p>{/if}
{:else if auth.status === 'error'}
	{#if feedback?.error}{@render feedback.error()}{:else}<p role="alert">
			{runtime.translations.t('ui.error_generic_desc')}
		</p>{/if}
{:else if auth.status === 'authenticated' && !redirectTo}
	{#if feedback?.fallback}{@render feedback.fallback()}{:else}<p role="alert">
			{runtime.translations.t('ui.error_forbidden_desc')}
		</p>{/if}
{/if}
