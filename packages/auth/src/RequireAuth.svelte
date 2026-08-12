<script lang="ts">
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import type { Snippet } from 'svelte';
	import { useAuth } from './context.svelte.ts';
	import type { GuardFeedback } from './guard.ts';
	import { currentInternalPath, withReturnTo } from './navigation.ts';

	let { redirectTo, children, feedback }: { redirectTo: string; children: Snippet; feedback?: GuardFeedback } =
		$props();
	const auth = useAuth();
	const runtime = useClinksRuntime();
	let redirecting = false;

	$effect(() => {
		if (auth.status !== 'anonymous') {
			redirecting = false;
			return;
		}
		if (redirecting) return;
		redirecting = true;
		void auth.navigate(withReturnTo(redirectTo, currentInternalPath()));
	});
</script>

{#if auth.status === 'authenticated'}
	{@render children()}
{:else if auth.status === 'loading'}
	{#if feedback?.loading}{@render feedback.loading()}{:else}<p aria-live="polite">
			{runtime.translations.t('ui.loading')}
		</p>{/if}
{:else if auth.status === 'error'}
	{#if feedback?.error}{@render feedback.error()}{:else}<p role="alert">
			{runtime.translations.t('ui.error_generic_desc')}
		</p>{/if}
{:else if feedback?.fallback}
	{@render feedback.fallback()}
{/if}
