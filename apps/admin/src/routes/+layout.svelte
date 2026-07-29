<script lang="ts">
	import { ClinksRuntimeProvider } from '@clinks/clinks-runtime';
	import { Toaster } from '@clinks/ui-shared/toaster';
	import '../app.css';
	let { children } = $props();
</script>

<ClinksRuntimeProvider applicationScope="admin">
	{@render children()}
	<Toaster />
</ClinksRuntimeProvider>
