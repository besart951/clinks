<script lang="ts">
	import * as Select from './components/ui/select/index.ts';

	export interface LanguageOption {
		readonly code: string;
		readonly name: string;
	}

	export interface LanguageSelection {
		readonly locale: string;
		readonly languages: readonly LanguageOption[];
		readonly isLoading: boolean;
		setLocale(locale: string): void | Promise<void>;
	}

	let { model, label }: { model: LanguageSelection; label: string } = $props();
	let selectedLanguage = $derived(model.languages.find((language) => language.code === model.locale));
</script>

<Select.Root value={model.locale} onValueChange={(locale) => void model.setLocale(locale)}>
	<Select.Trigger aria-label={label} class="min-w-40" disabled={model.isLoading}>
		{selectedLanguage?.name ?? label}
	</Select.Trigger>
	<Select.Content>
		{#each model.languages as language}
			<Select.Item value={language.code}>{language.name}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
