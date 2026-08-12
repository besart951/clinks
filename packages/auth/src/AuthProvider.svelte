<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { ClinksRuntimeProvider } from '@clinks/clinks-runtime';
	import type { Snippet } from 'svelte';
	import AuthContextProvider from './AuthContextProvider.svelte';
	import type { Navigate } from './auth-store.svelte.ts';

	let {
		applicationScope,
		navigate,
		children,
	}: { applicationScope: ApplicationScope; navigate: Navigate; children: Snippet } = $props();
</script>

<ClinksRuntimeProvider {applicationScope}>
	<AuthContextProvider {navigate}>
		{@render children()}
	</AuthContextProvider>
</ClinksRuntimeProvider>
