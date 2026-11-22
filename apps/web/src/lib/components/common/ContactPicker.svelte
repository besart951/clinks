<script lang="ts">
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import * as Popover from '@clinks/ui-shared/components/ui/popover';
	import * as Command from '@clinks/ui-shared/components/ui/command';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { contactName } from '#lib/data/workspace-api';
	import type { Contact } from '#lib/domain/types';
	import type { ContactId } from '#lib/domain/ids';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		id,
		value = $bindable(null),
		contacts,
		invalid = false,
		allowEmpty = true,
		onchange,
	}: {
		id?: string;
		value?: ContactId | null;
		contacts: Contact[];
		invalid?: boolean;
		allowEmpty?: boolean;
		onchange?: (contact: Contact | null) => void;
	} = $props();

	const workspace = useWorkspace();
	let open = $state(false);
	const selected = $derived(contacts.find((contact) => contact.id === value) ?? null);
	const sorted = $derived(
		[...contacts]
			.filter((contact) => !contact.archived)
			.sort((left, right) => contactName(left).localeCompare(contactName(right), 'de')),
	);

	function choose(contact: Contact | null) {
		value = contact?.id ?? null;
		open = false;
		onchange?.(contact);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				variant="outline"
				class="w-full justify-between font-normal"
				aria-invalid={invalid || undefined}
				role="combobox"
				aria-expanded={open}
			>
				<span class="truncate" class:text-muted-foreground={!selected}>
					{selected ? contactName(selected) : workspace.t('ui.ws.contact_picker.placeholder')}
				</span>
				<ChevronsUpDown class="text-muted-foreground size-4" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-(--bits-popover-anchor-width) min-w-64 p-0" align="start">
		<Command.Root>
			<Command.Input placeholder={workspace.t('ui.ws.contact_picker.search')} />
			<Command.List class="max-h-64">
				<Command.Empty>{workspace.t('ui.ws.command.empty')}</Command.Empty>
				{#if allowEmpty}
					<Command.Item value="__none" onSelect={() => choose(null)}>
						{workspace.t('ui.ws.contact_picker.none')}
					</Command.Item>
				{/if}
				{#each sorted as contact (contact.id)}
					<Command.Item
						value={`${contactName(contact)} ${contact.email} ${contact.address.city} ${contact.id}`}
						onSelect={() => choose(contact)}
					>
						<Check class="size-4 {contact.id === value ? '' : 'opacity-0'}" />
						<span class="truncate">{contactName(contact)}</span>
						<span class="text-muted-foreground ml-auto truncate text-xs">{contact.address.city}</span>
					</Command.Item>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
