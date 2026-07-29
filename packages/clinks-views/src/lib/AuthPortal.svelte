<script lang="ts">
	import type { AuthPortalViewModel, ThemeViewModel, TranslationBundleViewModel } from '@clinks/clinks-runtime';
	import AppHeader from './AppHeader.svelte';
	import AuthAccessForm from './AuthAccessForm.svelte';
	import AuthSessionDashboard from './AuthSessionDashboard.svelte';

	let {
		model,
		translations,
		theme,
	}: {
		model: AuthPortalViewModel;
		translations: TranslationBundleViewModel;
		theme: ThemeViewModel;
	} = $props();
</script>

<main class="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
	<div class="mx-auto max-w-5xl">
		<AppHeader title={translations.t(`ui.application_${model.application}`)} {translations} {theme} />
		{#if model.session}
			<AuthSessionDashboard portalModel={model} dashboardModel={model.authDashboard} {translations} />
		{:else}
			<AuthAccessForm
				model={model.authAccess}
				application={model.application}
				errorMessage={model.errorMessage}
				{translations}
			/>
		{/if}
	</div>
</main>
