<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Plus from '@lucide/svelte/icons/plus';
	import Upload from '@lucide/svelte/icons/upload';
	import Archive from '@lucide/svelte/icons/archive';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Merge from '@lucide/svelte/icons/merge';
	import Users from '@lucide/svelte/icons/users';
	import Building2 from '@lucide/svelte/icons/building-2';
	import * as Table from '@clinks/ui-shared/components/ui/table';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Checkbox } from '@clinks/ui-shared/components/ui/checkbox';
	import { Switch } from '@clinks/ui-shared/components/ui/switch';
	import { Label } from '@clinks/ui-shared/components/ui/label';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import SearchInput from '$lib/components/common/SearchInput.svelte';
	import Choice from '$lib/components/common/Choice.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '$lib/components/common/ConfirmDialog.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import ContactFormSheet from '$lib/components/contacts/ContactFormSheet.svelte';
	import ImportContactsDialog from '$lib/components/contacts/ImportContactsDialog.svelte';
	import MergeContactsDialog from '$lib/components/contacts/MergeContactsDialog.svelte';
	import { ContactsModel } from '$lib/features/contacts/contacts.svelte';
	import { contactName } from '$lib/data/workspace-api';
	import type { Contact } from '$lib/domain/types';
	import { href, navigate, routeQuery } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ContactsModel(workspace);
	const canWrite = $derived(workspace.session.can('contacts.write'));
	let sheet: ContactFormSheet;
	let mergeDialog: MergeContactsDialog;
	let importOpen = $state(false);
	let mergeSet = $state<Contact[]>([]);
	let confirm = $state<ConfirmRequest | null>(null);
	const selectedContacts = $derived(
		(model.resource.data ?? []).filter((contact) => model.selected.includes(contact.id)),
	);

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && sheet.show(null));
		if (routeQuery(page.url).get('new') === '1' && canWrite) sheet.show(null);
		return () => {
			stop();
			stopShortcut();
		};
	});

	function openMerge(contacts: Contact[]) {
		mergeSet = contacts;
		mergeDialog.show(contacts);
	}

	function askDelete() {
		const contacts = selectedContacts;
		confirm = {
			title: workspace.t('ui.ws.contacts.delete_title', { count: contacts.length }),
			description: workspace.t('ui.ws.contacts.delete_text'),
			confirmLabel: workspace.t('ui.ws.delete'),
			destructive: true,
			onConfirm: () => model.remove(contacts),
		};
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.module.contacts')} · CLinks</title></svelte:head>

<ModuleGate permission="contacts.read">
	<PageHeader title={workspace.t('ui.ws.module.contacts')} description={workspace.t('ui.ws.contacts.description')}>
		{#snippet actions()}
			{#if canWrite}
				<Button variant="outline" onclick={() => (importOpen = true)}
					><Upload class="size-4" />{workspace.t('ui.ws.contacts.import')}</Button
				>
				<Button onclick={() => sheet.show(null)} aria-keyshortcuts="N"
					><Plus class="size-4" />{workspace.t('ui.ws.command.new_contact')}</Button
				>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="mb-4 flex flex-wrap items-center gap-2">
		<SearchInput bind:value={model.search} label={workspace.t('ui.ws.contacts.search')} class="w-full sm:w-72" />
		<Choice
			bind:value={model.kind}
			class="w-36"
			label={workspace.t('ui.ws.contacts.kind')}
			options={[
				{ value: 'all', label: workspace.t('ui.ws.contacts.kind_all') },
				{ value: 'person', label: workspace.t('ui.ws.contacts.kind_person') },
				{ value: 'company', label: workspace.t('ui.ws.contacts.kind_company') },
			]}
		/>
		<Choice
			bind:value={model.tag}
			class="w-44"
			label={workspace.t('ui.ws.field.tags')}
			placeholder={workspace.t('ui.ws.contacts.all_tags')}
			options={[
				{ value: '', label: workspace.t('ui.ws.contacts.all_tags') },
				...model.tags.map((tag) => ({ value: tag, label: tag })),
			]}
		/>
		<Choice
			bind:value={model.sort}
			class="w-40"
			label={workspace.t('ui.ws.sort')}
			options={[
				{ value: 'name', label: workspace.t('ui.ws.contacts.sort_name') },
				{ value: 'city', label: workspace.t('ui.ws.contacts.sort_city') },
				{ value: 'created', label: workspace.t('ui.ws.contacts.sort_created') },
			]}
		/>
		<div class="flex items-center gap-2">
			<Switch id="show-archived" bind:checked={model.showArchived} />
			<Label for="show-archived">{workspace.t('ui.ws.contacts.show_archived')}</Label>
		</div>
		{#if model.duplicates.length > 0 && canWrite}
			<Button
				variant="ghost"
				size="sm"
				class="ml-auto text-amber-700 dark:text-amber-400"
				onclick={() => openMerge(model.duplicates[0])}
			>
				<Merge class="size-4" />{workspace.t('ui.ws.contacts.duplicates', { count: model.duplicates.length })}
			</Button>
		{/if}
	</div>

	{#if model.selected.length > 0 && canWrite}
		<div
			class="bg-muted mb-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm"
			role="region"
			aria-label={workspace.t('ui.ws.selection')}
		>
			<span class="font-medium">{workspace.t('ui.ws.selected', { count: model.selected.length })}</span>
			<div class="flex-1"></div>
			{#if model.selected.length >= 2}
				<Button size="sm" variant="outline" onclick={() => openMerge(selectedContacts)}
					><Merge class="size-4" />{workspace.t('ui.ws.contacts.merge_submit')}</Button
				>
			{/if}
			<Button size="sm" variant="outline" onclick={() => model.archive(selectedContacts, !model.showArchived)}>
				<Archive class="size-4" />{model.showArchived
					? workspace.t('ui.ws.contacts.unarchive')
					: workspace.t('ui.ws.contacts.archive')}
			</Button>
			<Button size="sm" variant="destructive" onclick={askDelete}
				><Trash2 class="size-4" />{workspace.t('ui.ws.delete')}</Button
			>
		</div>
	{/if}

	<AsyncView resource={model.resource} isEmpty={() => model.visible.length === 0}>
		{#snippet empty()}
			<EmptyState
				icon={Users}
				title={workspace.t('ui.ws.contacts.empty_title')}
				description={workspace.t('ui.ws.contacts.empty_text')}
			>
				{#snippet action()}
					{#if canWrite && !model.search}<Button onclick={() => sheet.show(null)}
							><Plus class="size-4" />{workspace.t('ui.ws.command.new_contact')}</Button
						>{/if}
				{/snippet}
			</EmptyState>
		{/snippet}
		{#snippet children()}
			<div class="rounded-xl border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							{#if canWrite}
								<Table.Head class="w-10">
									<Checkbox
										checked={model.visible.length > 0 &&
											model.visible.every((contact) => model.selected.includes(contact.id))}
										onCheckedChange={() => model.toggleAll()}
										aria-label={workspace.t('ui.ws.select_all')}
									/>
								</Table.Head>
							{/if}
							<Table.Head>{workspace.t('ui.ws.contacts.name')}</Table.Head>
							<Table.Head class="hidden md:table-cell">{workspace.t('ui.email')}</Table.Head>
							<Table.Head class="hidden lg:table-cell">{workspace.t('ui.ws.field.phone')}</Table.Head>
							<Table.Head class="hidden sm:table-cell">{workspace.t('ui.ws.field.city')}</Table.Head>
							<Table.Head class="hidden xl:table-cell">{workspace.t('ui.ws.field.tags')}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each model.visible as contact (contact.id)}
							<Table.Row class="cursor-pointer" onclick={() => navigate(`/contacts/${contact.id}`)}>
								{#if canWrite}
									<Table.Cell onclick={(event: MouseEvent) => event.stopPropagation()}>
										<Checkbox
											checked={model.selected.includes(contact.id)}
											onCheckedChange={() => model.toggle(contact.id)}
											aria-label={workspace.t('ui.ws.select', { name: contactName(contact) })}
										/>
									</Table.Cell>
								{/if}
								<Table.Cell>
									<a
										href={href(`/contacts/${contact.id}`)}
										class="flex items-center gap-2 font-medium"
										onclick={(event) => event.stopPropagation()}
									>
										{#if contact.kind === 'company'}<Building2 class="text-muted-foreground size-4" />{:else}<Users
												class="text-muted-foreground size-4"
											/>{/if}
										{contactName(contact)}
									</a>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground hidden md:table-cell">{contact.email}</Table.Cell>
								<Table.Cell class="text-muted-foreground hidden lg:table-cell">{contact.phone}</Table.Cell>
								<Table.Cell class="hidden sm:table-cell">{contact.address.city}</Table.Cell>
								<Table.Cell class="hidden xl:table-cell">
									<div class="flex flex-wrap gap-1">
										{#each contact.tags as tag (tag)}<span class="bg-muted rounded-full px-2 py-0.5 text-xs">{tag}</span
											>{/each}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			<p class="text-muted-foreground mt-2 text-xs">
				{workspace.t('ui.ws.contacts.count', { count: model.visible.length })}
			</p>
		{/snippet}
	</AsyncView>
</ModuleGate>

<ContactFormSheet bind:this={sheet} onSaved={(contact) => navigate(`/contacts/${contact.id}`)} />
<ImportContactsDialog bind:open={importOpen} onImport={(drafts) => model.importContacts(drafts)} />
<MergeContactsDialog
	bind:this={mergeDialog}
	contacts={mergeSet}
	onMerge={(primary, others) => model.merge(primary, others)}
/>
<ConfirmDialog bind:request={confirm} />
