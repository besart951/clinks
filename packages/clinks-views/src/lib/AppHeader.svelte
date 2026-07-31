<script lang="ts">
	import type { ThemeViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import LanguageSelector from '@clinks/ui-shared/language-selector';
	import ThemeToggle from '@clinks/ui-shared/theme-toggle';

	let { title, theme }: { title: string; theme: ThemeViewModel } = $props();
	const runtime = useClinksRuntime();
	const t = (key: string) => runtime.translations.t(key);
</script>

<header class="mb-12 flex items-center justify-between gap-3">
	<a class="text-xl font-bold tracking-tight" href="/">{title}</a>
	<div class="flex items-center gap-2">
		<LanguageSelector model={runtime.translations} label={t('ui.languages')} />
		<ThemeToggle
			model={theme}
			labels={{
				label: t('ui.theme'),
				system: t('ui.theme_system'),
				light: t('ui.theme_light'),
				dark: t('ui.theme_dark'),
			}}
		/>
	</div>
</header>
