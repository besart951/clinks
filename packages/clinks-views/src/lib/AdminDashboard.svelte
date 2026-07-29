<script lang="ts">
	import type { AdminDashboardViewModel, ThemeViewModel, TranslationBundleViewModel } from '@clinks/clinks-runtime';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import AdminLogin from './AdminLogin.svelte';
	import AppHeader from './AppHeader.svelte';
	import AuditPanel from './AuditPanel.svelte';
	import LocalizationPanel from './LocalizationPanel.svelte';
	import TenantPanel from './TenantPanel.svelte';

	let {
		model,
		translations,
		theme,
	}: {
		model: AdminDashboardViewModel;
		translations: TranslationBundleViewModel;
		theme: ThemeViewModel;
	} = $props();
	const t = (key: string) => translations.t(key);
</script>

<main class="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
	<div class="mx-auto max-w-7xl">
		<AppHeader title={t('ui.dashboard')} {translations} {theme} />
		{#if model.isSuperAdministrator}
			<Card.Root class="mb-6"
				><Card.Content class="flex items-center justify-between gap-4"
					><div class="flex items-center gap-3">
						<Badge variant="secondary">{t('ui.super_administrator')}</Badge><span class="text-sm font-medium"
							>{model.sessionEmail}</span
						>
					</div>
					<Button type="button" variant="outline" size="sm" onclick={() => void model.signOut()}
						>{t('ui.sign_out')}</Button
					></Card.Content
				></Card.Root
			>
			{#if model.errorMessage}<Alert.Root class="mb-6" variant="destructive" aria-live="polite"
					><Alert.Description>{model.errorMessage}</Alert.Description></Alert.Root
				>{/if}
			<div class="grid gap-6 lg:grid-cols-2">
				<TenantPanel model={model.tenantModel} {translations} />
				<LocalizationPanel model={model.localizationModel} {translations} />
				<AuditPanel model={model.auditLogModel} {translations} />
			</div>
		{:else}
			<AdminLogin {model} {translations} />
		{/if}
	</div>
</main>
