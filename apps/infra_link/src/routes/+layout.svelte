<script lang="ts">
	import { ClinksRuntimeProvider } from '@clinks/clinks-runtime';
	import { Toaster } from '@clinks/ui-shared/toaster';
	import '../app.css';
	let { children } = $props();
</script>

<ClinksRuntimeProvider applicationScope="infra_link">
	{@render children()}
	<Toaster />
</ClinksRuntimeProvider>
