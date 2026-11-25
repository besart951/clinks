<script lang="ts">
	import { streetLine } from '@clinks/domain/address';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import ViewToggle, { type ListView } from '#lib/components/common/ViewToggle.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import * as Table from '@clinks/ui/components/ui/table';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import SearchInput from '#lib/components/common/SearchInput.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import SpitexNav from '#lib/components/spitex/SpitexNav.svelte';
	import ContactFormSheet from '#lib/components/contacts/ContactFormSheet.svelte';
	import { ClientsModel, clientTag } from '#lib/features/spitex/clients.svelte';
	import Initials from '@clinks/ui/kit/Initials.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { href, navigate, routeQuery, setQuery } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ClientsModel(workspace);
	const canWrite = $derived(workspace.session.can('contacts.write'));
	let sheet: ContactFormSheet;
	onMount(() => model.resource.connect());

	let view = $state<ListView>(routeQuery(page.url).get('view') === 'cards' ? 'cards' : 'table');

	function changeView(next: ListView) {
		view = next;
		void setQuery(page.url, { view: next === 'cards' ? next : null });
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.spitex.clients')} · CLinks</title></svelte:head>

<ModuleGate module="spitex" permission="spitex.read">
	<PageHeader title={workspace.t('ui.ws.module.spitex')}>
		{#snippet actions()}{#if canWrite}<Button onclick={() => sheet.show(null, { tags: [clientTag] })}>
					<Plus class="size-4" />{workspace.t('ui.ws.spitex.new_client')}
				</Button>{/if}{/snippet}
	</PageHeader>
	<SpitexNav />
	<div class="mb-4 flex flex-wrap items-center gap-2">
		<SearchInput bind:value={model.search} label={workspace.t('ui.ws.contacts.search')} class="w-full sm:w-72" />
		<div class="ms-auto"><ViewToggle {view} onchange={changeView} /></div>
	</div>
	<AsyncView resource={model.resource} skeleton={view === 'cards' ? 'cards' : 'list'}>
		{#if view === 'cards'}
			<ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
				{#each model.rows as row (row.client.id)}
					<li>
						<a
							class="bg-card hover:border-foreground/30 focus-visible:ring-ring/50 flex h-full flex-col gap-3 rounded-xl border p-4 shadow-[var(--shadow-sm)] transition-colors outline-none focus-visible:ring-3"
							href={href(`/spitex/clients/${row.client.id}`)}
						>
							<span class="flex items-center gap-2.5">
								<Initials name={contactName(row.client)} />
								<span class="grid min-w-0">
									<span class="truncate font-medium">{contactName(row.client)}</span>
									{#if row.client.notes}<span class="text-muted-foreground line-clamp-2 text-xs">
											{row.client.notes}
										</span>{/if}
								</span>
							</span>
							<span class="text-muted-foreground grid gap-1.5 text-xs">
								<span class="flex items-center gap-2">
									<MapPin class="size-3.5 shrink-0" />
									<span class="truncate">{streetLine(row.client.address)}, {row.client.address.city}</span>
								</span>
								<span class="flex items-center gap-2">
									<CalendarClock class="size-3.5 shrink-0" />
									<span class="text-foreground">
										{row.next ? workspace.i18n.dateTime(row.next.start) : '—'}
									</span>
								</span>
							</span>
							<span class="mt-auto flex items-center gap-3 border-t pt-3 text-xs">
								<span class="text-muted-foreground">{workspace.t('ui.ws.spitex.last_week')}</span>
								<span class="ms-auto flex gap-[3px]" aria-hidden="true">
									{#each row.weekdays as visited, day (day)}<span
											class="size-[6px] rounded-full {visited ? 'bg-foreground' : 'bg-border'}"
										></span>{/each}
								</span>
								<span class="tabular-nums">{workspace.t('ui.ws.spitex.count', { count: row.perWeek })}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="rounded-xl border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{workspace.t('ui.ws.contacts.name')}</Table.Head><Table.Head class="hidden md:table-cell">
								{workspace.t('ui.ws.contacts.address')}
							</Table.Head><Table.Head>{workspace.t('ui.ws.spitex.next_visit')}</Table.Head><Table.Head
								class="hidden sm:table-cell"
							>
								{workspace.t('ui.ws.spitex.last_week')}
							</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each model.rows as row (row.client.id)}
							<Table.Row class="cursor-pointer" onclick={() => navigate(`/spitex/clients/${row.client.id}`)}>
								<Table.Cell>
									<span class="flex items-center gap-2.5">
										<Initials name={contactName(row.client)} /><span class="grid min-w-0">
											<a
												class="font-medium hover:underline"
												href={href(`/spitex/clients/${row.client.id}`)}
												onclick={(event) => event.stopPropagation()}
											>
												{contactName(row.client)}
											</a>{#if row.client.notes}<span class="text-muted-foreground block max-w-64 truncate text-xs">
													{row.client.notes}
												</span>{/if}
										</span>
									</span>
								</Table.Cell>
								<Table.Cell class="hidden md:table-cell">
									{streetLine(row.client.address)}, {row.client.address.city}
								</Table.Cell>
								<Table.Cell>{row.next ? workspace.i18n.dateTime(row.next.start) : '—'}</Table.Cell>
								<Table.Cell class="hidden sm:table-cell">
									<span class="flex items-center gap-3">
										<span class="flex gap-[3px]" aria-hidden="true">
											{#each row.weekdays as visited, day (day)}<span
													class="size-[5px] rounded-full {visited ? 'bg-foreground' : 'bg-border'}"
												></span>{/each}
										</span>{workspace.t('ui.ws.spitex.count', { count: row.perWeek })}
									</span>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</AsyncView>
</ModuleGate>
<ContactFormSheet bind:this={sheet} onSaved={(contact) => navigate(`/spitex/clients/${contact.id}`)} />
