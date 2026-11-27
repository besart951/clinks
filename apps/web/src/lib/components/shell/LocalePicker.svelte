<script lang="ts">
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import { locales, type Locale } from '@clinks/i18n-types/catalog';
	import Flag from '#lib/components/common/Flag.svelte';
	import { localeNames } from '#lib/i18n/locale-names';
	import { chooseLocale } from '#lib/features/shell/locale';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * The language as a menu with flag and name, so more languages fit later. `full` fills its place (sidebar,
	 * profile); `compact` is a small button (sign-in pages); `flag` shows only the flag (collapsed sidebar).
	 */
	let { look = 'compact', id }: { look?: 'full' | 'compact' | 'flag'; id?: string } = $props();
	const workspace = useWorkspace();
	const current = $derived(localeNames[workspace.i18n.locale]);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				variant={look === 'full' ? 'outline' : 'ghost'}
				size={look === 'flag' ? 'icon-sm' : 'sm'}
				class={look === 'full' ? 'w-full justify-start' : ''}
				aria-label={`${workspace.t('ui.languages')}: ${workspace.t(current.name)}`}
				title={look === 'flag' ? workspace.t(current.name) : undefined}
			>
				<Flag country={current.country} />
				{#if look !== 'flag'}<span class="truncate">{workspace.t(current.name)}</span>{/if}
				{#if look === 'full'}<ChevronsUpDown class="text-muted-foreground ms-auto size-3.5" />{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align={look === 'compact' ? 'end' : 'start'} class="min-w-48">
		<DropdownMenu.Label class="text-muted-foreground text-xs font-normal">
			{workspace.t('ui.languages')}
		</DropdownMenu.Label>
		<DropdownMenu.RadioGroup
			value={workspace.i18n.locale}
			onValueChange={(value) => void chooseLocale(workspace, value as Locale)}
		>
			{#each locales as locale (locale)}
				{@const info = localeNames[locale]}
				<DropdownMenu.RadioItem value={locale} lang={locale} closeOnSelect class="gap-2">
					<Flag country={info.country} />{workspace.t(info.name)}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
