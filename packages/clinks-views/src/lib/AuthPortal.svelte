<script lang="ts">
	import type { AuthPortalViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { useAuth } from '@clinks/auth';
	import AppHeader from './AppHeader.svelte';
	import AuthAccessForm from './AuthAccessForm.svelte';
	import AuthSessionDashboard from './AuthSessionDashboard.svelte';

	let { model }: { model: AuthPortalViewModel } = $props();
	const runtime = useClinksRuntime();
	const auth = useAuth();
	const t = (key: string) => runtime.translations.t(key);

	async function signOut() {
		await auth.logout();
		model.authAccess.clear();
		model.authDashboard.clear();
	}
</script>

<main class="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
	<div class="mx-auto max-w-5xl">
		<AppHeader title={t(`ui.application_${model.application}`)} theme={runtime.theme} />
		{#if auth.status === 'loading'}
			<p class="text-muted-foreground" aria-live="polite">{t('ui.loading')}</p>
		{:else if auth.status === 'error'}
			<p class="text-destructive" role="alert">{t('ui.error_generic_desc')}</p>
		{:else if auth.isAuthenticated}
			<AuthSessionDashboard portalModel={model} dashboardModel={model.authDashboard} {signOut} />
		{:else}
			<AuthAccessForm model={model.authAccess} application={model.application} errorMessage={model.errorMessage} />
		{/if}
	</div>
</main>
