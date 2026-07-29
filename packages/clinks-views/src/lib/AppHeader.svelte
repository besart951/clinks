<script lang="ts">
	import LanguageSelector from '@clinks/ui-shared/language-selector';
	import ThemeToggle from '@clinks/ui-shared/theme-toggle';
	import type { ThemeViewModel, TranslationBundleViewModel } from '@clinks/clinks-runtime';

	let {
		title,
		translations,
		theme,
	}: {
		title: string;
		translations: TranslationBundleViewModel;
		theme: ThemeViewModel;
	} = $props();
</script>

<header class="mb-12 flex items-center justify-between gap-3">
	<a class="text-xl font-bold tracking-tight" href="/">{title}</a>
	<div class="flex items-center gap-2">
		<LanguageSelector model={translations} label={translations.t('ui.languages')} />
		<ThemeToggle
			model={theme}
			labels={{
				label: translations.t('ui.theme'),
				system: translations.t('ui.theme_system'),
				light: translations.t('ui.theme_light'),
				dark: translations.t('ui.theme_dark'),
			}}
		/>
	</div>
</header>
