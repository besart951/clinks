<script lang="ts">
	import { goto } from '$app/navigation';
	import { AuthProvider } from '@clinks/auth';
	import { Toaster } from '@clinks/ui-shared/toaster';
	import type { Snippet } from 'svelte';
	import '../app.css';

	let { children }: { children: Snippet } = $props();
</script>

<AuthProvider applicationScope="admin" navigate={goto}>
	{@render children()}
	<Toaster />
</AuthProvider>
