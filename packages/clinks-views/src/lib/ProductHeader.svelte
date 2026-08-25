<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { useAuth } from '@clinks/auth';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import LanguageSelector from '@clinks/ui-shared/language-selector';
	import ThemeToggle from '@clinks/ui-shared/theme-toggle';
	import Link2 from '@lucide/svelte/icons/link-2';

	let { application }: { application: ApplicationScope } = $props();
	const runtime = useClinksRuntime();
	const auth = useAuth();
	const t = (key: string) => runtime.translations.t(key);
</script>

<header class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
	<a
		class="flex items-center gap-3 font-semibold tracking-tight"
		href="/"
		aria-label={t(`ui.application_${application}`)}
	>
		<span class="bg-foreground text-background grid size-9 place-items-center rounded-xl"
			><Link2 class="size-4" aria-hidden="true" /></span
		>
		<span>{t(`ui.application_${application}`)}</span>
	</a>
	<div class="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
		<LanguageSelector model={runtime.translations} label={t('ui.languages')} />
		<ThemeToggle
			model={runtime.theme}
			labels={{
				label: t('ui.theme'),
				system: t('ui.theme_system'),
				light: t('ui.theme_light'),
				dark: t('ui.theme_dark'),
			}}
		/>
		{#if auth.status === 'authenticated'}
			<Button href="/dashboard" size="sm">{t('ui.open_dashboard')}</Button>
		{:else if auth.status === 'anonymous'}
			<Button href="/login" variant="ghost" size="sm" class="hidden sm:inline-flex">{t('ui.sign_in')}</Button>
			<Button href="/signup" size="sm">{t('ui.get_started')}</Button>
		{:else if auth.status === 'error'}
			<Button variant="outline" size="sm" onclick={() => void auth.refresh()}>{t('ui.try_again')}</Button>
		{:else}
			<Button variant="outline" size="sm" disabled>{t('ui.loading')}</Button>
		{/if}
	</div>
</header>
