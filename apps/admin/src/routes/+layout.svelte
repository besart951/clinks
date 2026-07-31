<script lang="ts">
	import { ClinksRuntimeProvider } from '@clinks/clinks-runtime';
	import { Toaster } from '@clinks/ui-shared/toaster';
	import type { Snippet } from 'svelte';
	import '../app.css';

	let { children }: { children: Snippet } = $props();
</script>

<ClinksRuntimeProvider applicationScope="admin">
	{@render children()}
	<Toaster />
</ClinksRuntimeProvider>
