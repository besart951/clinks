<script lang="ts">
	import { goto } from '$app/navigation';
	import { useAuth } from '@clinks/auth';
	import AdminLogin from '$lib/AdminLogin.svelte';

	const auth = useAuth();

	$effect(() => {
		if (auth.isSuperAdministrator) {
			void goto('/dashboard');
		}
	});
</script>

<svelte:head><title>Clinks Admin</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-8 dark:bg-slate-950">
	<AdminLogin />
</main>
