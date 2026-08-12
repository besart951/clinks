<script lang="ts">
	import { goto } from '$app/navigation';
	import { AuthProvider } from '@clinks/auth';
	import { Toaster } from '@clinks/ui-shared/toaster';
	import '../app.css';
	let { children } = $props();
</script>

<AuthProvider applicationScope="infra_link" navigate={goto}>
	{@render children()}
	<Toaster />
</AuthProvider>
