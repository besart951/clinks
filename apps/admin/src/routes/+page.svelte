<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import AdminLogin from '$lib/AdminLogin.svelte';

	const runtime = useClinksRuntime();

	onMount(() => {
		if (runtime.session.isSuperAdmin) {
			void goto('/dashboard');
		}
	});
</script>

<svelte:head><title>Clinks Admin</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-8 dark:bg-slate-950">
	<AdminLogin />
</main>
