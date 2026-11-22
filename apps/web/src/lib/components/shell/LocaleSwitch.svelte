<script lang="ts">
	import Languages from '@lucide/svelte/icons/languages';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import { locales, type Locale } from '#lib/i18n/catalog';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const names: { [locale in Locale]: string } = { 'de-CH': 'Deutsch', 'en-US': 'English' };
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="sm" aria-label={workspace.t('ui.languages')}>
				<Languages class="size-4" />
				<span class="hidden sm:inline">{names[workspace.i18n.locale]}</span>
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.RadioGroup
			value={workspace.i18n.locale}
			onValueChange={(value) => workspace.i18n.setLocale(value as Locale)}
		>
			{#each locales as locale (locale)}
				<DropdownMenu.RadioItem value={locale}>{names[locale]}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
