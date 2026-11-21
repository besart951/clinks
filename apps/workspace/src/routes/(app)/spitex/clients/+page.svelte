<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import * as Table from '@clinks/ui-shared/components/ui/table';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import SearchInput from '$lib/components/common/SearchInput.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import SpitexNav from '$lib/components/spitex/SpitexNav.svelte';
	import ContactFormSheet from '$lib/components/contacts/ContactFormSheet.svelte';
	import { ClientsModel, clientTag } from '$lib/features/spitex/clients.svelte';
	import { contactName } from '$lib/data/workspace-api';
	import { href, navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ClientsModel(workspace);
	const canWrite = $derived(workspace.session.can('contacts.write'));
	let sheet: ContactFormSheet;
	onMount(() => model.resource.connect());
</script>

<svelte:head><title>{workspace.t('ui.ws.spitex.clients')} · CLinks</title></svelte:head>

<ModuleGate module="spitex" permission="spitex.read">
	<PageHeader title={workspace.t('ui.ws.module.spitex')}>
		{#snippet actions()}{#if canWrite}<Button onclick={() => sheet.show(null, { tags: [clientTag] })}
					><Plus class="size-4" />{workspace.t('ui.ws.spitex.new_client')}</Button
				>{/if}{/snippet}
	</PageHeader>
	<SpitexNav />
	<SearchInput bind:value={model.search} label={workspace.t('ui.ws.contacts.search')} class="mb-4 w-full sm:w-72" />
	<AsyncView resource={model.resource}>
		{#snippet children()}
			<div class="rounded-xl border">
				<Table.Root>
					<Table.Header
						><Table.Row
							><Table.Head>{workspace.t('ui.ws.contacts.name')}</Table.Head><Table.Head class="hidden md:table-cell"
								>{workspace.t('ui.ws.contacts.address')}</Table.Head
							><Table.Head>{workspace.t('ui.ws.spitex.next_visit')}</Table.Head><Table.Head class="hidden sm:table-cell"
								>{workspace.t('ui.ws.spitex.last_week')}</Table.Head
							></Table.Row
						></Table.Header
					>
					<Table.Body>
						{#each model.rows as row (row.client.id)}
							<Table.Row class="cursor-pointer" onclick={() => navigate(`/spitex/clients/${row.client.id}`)}>
								<Table.Cell
									><a
										class="font-medium hover:underline"
										href={href(`/spitex/clients/${row.client.id}`)}
										onclick={(event) => event.stopPropagation()}>{contactName(row.client)}</a
									>{#if row.client.notes}<span class="text-muted-foreground block max-w-64 truncate text-xs"
											>{row.client.notes}</span
										>{/if}</Table.Cell
								>
								<Table.Cell class="hidden md:table-cell"
									>{row.client.address.street}, {row.client.address.city}</Table.Cell
								>
								<Table.Cell>{row.next ? workspace.i18n.dateTime(row.next.start) : '—'}</Table.Cell>
								<Table.Cell class="hidden sm:table-cell"
									>{workspace.t('ui.ws.spitex.count', { count: row.perWeek })}</Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>
<ContactFormSheet bind:this={sheet} onSaved={(contact) => navigate(`/spitex/clients/${contact.id}`)} />
