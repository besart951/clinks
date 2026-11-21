<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Pencil from '@lucide/svelte/icons/pencil';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Send from '@lucide/svelte/icons/send';
	import Archive from '@lucide/svelte/icons/archive';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import House from '@lucide/svelte/icons/house';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as DropdownMenu from '@clinks/ui-shared/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '$lib/components/common/ConfirmDialog.svelte';
	import { appointmentTone, invoiceTone, priorityTone } from '$lib/components/common/tones';
	import ContactFormSheet from '$lib/components/contacts/ContactFormSheet.svelte';
	import CommentThread from '$lib/components/collaboration/CommentThread.svelte';
	import AttachmentPanel from '$lib/components/collaboration/AttachmentPanel.svelte';
	import ObjectTimeline from '$lib/components/collaboration/ObjectTimeline.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import { ContactDetailModel } from '$lib/features/contacts/contact-detail.svelte';
	import { PeopleDirectory } from '$lib/features/collaboration/people.svelte';
	import { contactName } from '$lib/data/workspace-api';
	import { effectiveStatus, invoiceTotals } from '$lib/domain/money';
	import { today } from '$lib/domain/dates';
	import type { ContactId } from '$lib/domain/ids';
	import { href, navigate, routeQuery, setQuery } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const id = page.params.id as ContactId;
	const model = new ContactDetailModel(workspace, id);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(session.can('contacts.write'));
	const tab = $derived(routeQuery(page.url).get('tab') ?? 'overview');
	let sheet: ContactFormSheet;
	let confirm = $state<ConfirmRequest | null>(null);

	onMount(() => {
		void people.load();
		return model.resource.connect();
	});

	function askDelete() {
		const contact = model.resource.value.contact;
		confirm = {
			title: workspace.t('ui.ws.contacts.delete_title', { count: 1 }),
			description: workspace.t('ui.ws.contacts.delete_text'),
			confirmLabel: workspace.t('ui.ws.delete'),
			destructive: true,
			onConfirm: async () => {
				if (await model.remove(contact)) await navigate('/contacts');
			},
		};
	}
</script>

<svelte:head
	><title
		>{model.resource.data ? contactName(model.resource.data.contact) : workspace.t('ui.ws.module.contacts')} · CLinks</title
	></svelte:head
>

<ModuleGate permission="contacts.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ contact, appointments, invoices, mails, tasks })}
			<PageHeader
				title={contactName(contact)}
				crumbs={[{ label: workspace.t('ui.ws.module.contacts'), path: '/contacts' }, { label: contactName(contact) }]}
			>
				{#snippet actions()}
					{#if contact.tags.includes('Patient:in') && session.hasModule('physio')}
						<Button variant="outline" href={href(`/physio/${contact.id}`)}
							><HeartPulse class="size-4" />{workspace.t('ui.ws.physio.open_record')}</Button
						>
					{/if}
					{#if contact.tags.includes('Klient:in') && session.hasModule('spitex')}
						<Button variant="outline" href={href(`/spitex/clients/${contact.id}`)}
							><House class="size-4" />{workspace.t('ui.ws.spitex.open_client')}</Button
						>
					{/if}
					{#if canWrite}<Button variant="outline" onclick={() => sheet.show(contact)}
							><Pencil class="size-4" />{workspace.t('ui.ws.edit')}</Button
						>{/if}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}<Button
									{...props}
									variant="outline"
									size="icon"
									aria-label={workspace.t('ui.ws.more_actions')}><Ellipsis class="size-4" /></Button
								>{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#if session.can('calendar.write')}<DropdownMenu.Item
									onclick={() => navigate(`/calendar?new=1&contact=${contact.id}`)}
									><CalendarPlus class="size-4" />{workspace.t('ui.ws.command.new_appointment')}</DropdownMenu.Item
								>{/if}
							{#if session.can('finance.write') && session.hasModule('finance')}<DropdownMenu.Item
									onclick={() => navigate(`/finance/invoices/new?contact=${contact.id}`)}
									><ReceiptText class="size-4" />{workspace.t('ui.ws.command.new_invoice')}</DropdownMenu.Item
								>{/if}
							{#if session.can('mail.write') && session.hasModule('mail') && contact.email}<DropdownMenu.Item
									onclick={() => navigate(`/mail?compose=1&to=${encodeURIComponent(contact.email)}`)}
									><Send class="size-4" />{workspace.t('ui.ws.command.new_mail')}</DropdownMenu.Item
								>{/if}
							{#if canWrite}
								<DropdownMenu.Separator />
								<DropdownMenu.Item onclick={() => model.setArchived(contact, !contact.archived)}
									><Archive class="size-4" />{contact.archived
										? workspace.t('ui.ws.contacts.unarchive')
										: workspace.t('ui.ws.contacts.archive')}</DropdownMenu.Item
								>
								<DropdownMenu.Item variant="destructive" onclick={askDelete}
									><Trash2 class="size-4" />{workspace.t('ui.ws.delete')}</DropdownMenu.Item
								>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/snippet}
			</PageHeader>
			{#if contact.archived}<p class="bg-muted mb-4 rounded-lg px-3 py-2 text-sm">
					{workspace.t('ui.ws.contacts.is_archived')}
				</p>{/if}

			<Tabs.Root
				value={tab}
				onValueChange={(value) => setQuery(page.url, { tab: value === 'overview' ? null : value })}
			>
				<Tabs.List class="mb-4 max-w-full overflow-x-auto">
					<Tabs.Trigger value="overview">{workspace.t('ui.ws.contacts.tab_overview')}</Tabs.Trigger>
					{#if session.can('calendar.read')}<Tabs.Trigger value="appointments"
							>{workspace.t('ui.ws.command.group_appointments')} ({appointments.length})</Tabs.Trigger
						>{/if}
					{#if session.can('finance.read') && session.hasModule('finance')}<Tabs.Trigger value="invoices"
							>{workspace.t('ui.ws.command.group_invoices')} ({invoices.length})</Tabs.Trigger
						>{/if}
					{#if session.can('mail.read') && session.hasModule('mail')}<Tabs.Trigger value="mails"
							>{workspace.t('ui.ws.command.group_mails')} ({mails.length})</Tabs.Trigger
						>{/if}
					{#if session.can('planner.read') && session.hasModule('planner')}<Tabs.Trigger value="tasks"
							>{workspace.t('ui.ws.command.group_tasks')} ({tasks.length})</Tabs.Trigger
						>{/if}
					{#if session.can('documents.read')}<Tabs.Trigger value="documents"
							>{workspace.t('ui.ws.module.documents')}</Tabs.Trigger
						>{/if}
					<Tabs.Trigger value="comments">{workspace.t('ui.ws.comments.title')}</Tabs.Trigger>
					{#if session.can('audit.read')}<Tabs.Trigger value="activity"
							>{workspace.t('ui.ws.nav.activity')}</Tabs.Trigger
						>{/if}
				</Tabs.List>

				<Tabs.Content value="overview">
					<div class="grid gap-4 lg:grid-cols-3">
						<Card.Root class="lg:col-span-2">
							<Card.Header><Card.Title>{workspace.t('ui.ws.contacts.master_data')}</Card.Title></Card.Header>
							<Card.Content>
								<dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
									<div>
										<dt class="text-muted-foreground">{workspace.t('ui.email')}</dt>
										<dd class="flex items-center gap-2">
											{#if contact.email}<Mail class="size-3.5" /><a
													class="hover:underline"
													href="mailto:{contact.email}">{contact.email}</a
												>{:else}—{/if}
										</dd>
									</div>
									<div>
										<dt class="text-muted-foreground">{workspace.t('ui.ws.field.phone')}</dt>
										<dd class="flex items-center gap-2">
											{#if contact.phone}<Phone class="size-3.5" /><a class="hover:underline" href="tel:{contact.phone}"
													>{contact.phone}</a
												>{:else}—{/if}
										</dd>
									</div>
									<div class="sm:col-span-2">
										<dt class="text-muted-foreground">{workspace.t('ui.ws.contacts.address')}</dt>
										<dd class="flex items-center gap-2">
											<MapPin class="size-3.5" />{[
												contact.address.street,
												`${contact.address.zip} ${contact.address.city}`.trim(),
											]
												.filter(Boolean)
												.join(', ') || '—'}
										</dd>
									</div>
									{#if contact.kind === 'person'}
										<div>
											<dt class="text-muted-foreground">{workspace.t('ui.ws.field.birth_date')}</dt>
											<dd>{contact.birthDate ? workspace.i18n.date(contact.birthDate) : '—'}</dd>
										</div>
										<div>
											<dt class="text-muted-foreground">{workspace.t('ui.ws.field.insurer')}</dt>
											<dd>{contact.insurer || '—'}</dd>
										</div>
									{/if}
									<div class="sm:col-span-2">
										<dt class="text-muted-foreground">{workspace.t('ui.ws.field.tags')}</dt>
										<dd class="mt-1 flex flex-wrap gap-1">
											{#each contact.tags as tag (tag)}<span class="bg-muted rounded-full px-2 py-0.5 text-xs"
													>{tag}</span
												>{:else}—{/each}
										</dd>
									</div>
								</dl>
							</Card.Content>
						</Card.Root>
						<Card.Root>
							<Card.Header><Card.Title>{workspace.t('ui.ws.field.notes')}</Card.Title></Card.Header>
							<Card.Content
								><p class="text-sm whitespace-pre-wrap">
									{contact.notes || workspace.t('ui.ws.contacts.no_notes')}
								</p></Card.Content
							>
						</Card.Root>
					</div>
				</Tabs.Content>

				<Tabs.Content value="appointments">
					<ul class="divide-y rounded-xl border">
						{#each appointments as appointment (appointment.id)}
							<li class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
								<time class="w-36 tabular-nums" datetime={appointment.start}
									>{workspace.i18n.dateTime(appointment.start)}</time
								>
								<a
									class="flex-1 font-medium hover:underline"
									href={href(`/calendar?date=${appointment.start.slice(0, 10)}&appointment=${appointment.id}`)}
									>{appointment.title}</a
								>
								<StatusBadge
									tone={appointmentTone[appointment.status]}
									label={workspace.t(`ui.ws.appointment.status.${appointment.status}`)}
								/>
							</li>
						{:else}<li class="text-muted-foreground px-4 py-6 text-center text-sm">
								{workspace.t('ui.ws.contacts.no_appointments')}
							</li>{/each}
					</ul>
				</Tabs.Content>

				<Tabs.Content value="invoices">
					<ul class="divide-y rounded-xl border">
						{#each invoices as invoice (invoice.id)}
							{@const status = effectiveStatus(invoice, today())}
							<li class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
								<a class="w-28 font-medium hover:underline" href={href(`/finance/invoices/${invoice.id}`)}
									>{invoice.number}</a
								>
								<span class="text-muted-foreground flex-1">{workspace.i18n.date(invoice.issueDate)}</span>
								<span class="tabular-nums">{workspace.i18n.money(invoiceTotals(invoice).gross)}</span>
								<StatusBadge tone={invoiceTone[status]} label={workspace.t(`ui.ws.invoice.status.${status}`)} />
							</li>
						{:else}<li class="text-muted-foreground px-4 py-6 text-center text-sm">
								{workspace.t('ui.ws.contacts.no_invoices')}
							</li>{/each}
					</ul>
				</Tabs.Content>

				<Tabs.Content value="mails">
					<ul class="divide-y rounded-xl border">
						{#each mails as mail (mail.id)}
							<li class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
								<span class="text-muted-foreground w-36">{workspace.i18n.dateTime(mail.sentAt)}</span>
								<a
									class="flex-1 truncate font-medium hover:underline"
									href={href(`/mail?folder=${mail.folder}&message=${mail.id}`)}
									>{mail.subject || workspace.t('ui.ws.mail.no_subject')}</a
								>
								<span class="text-muted-foreground">{workspace.t(`ui.ws.mail.folder.${mail.folder}`)}</span>
							</li>
						{:else}<li class="text-muted-foreground px-4 py-6 text-center text-sm">
								{workspace.t('ui.ws.contacts.no_mails')}
							</li>{/each}
					</ul>
				</Tabs.Content>

				<Tabs.Content value="tasks">
					<ul class="divide-y rounded-xl border">
						{#each tasks as task (task.id)}
							<li class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
								<a class="flex-1 font-medium hover:underline" href={href(`/planner?task=${task.id}`)}>{task.title}</a>
								<span class="text-muted-foreground">{workspace.t(`ui.ws.task.status.${task.status}`)}</span>
								<StatusBadge
									tone={priorityTone[task.priority]}
									label={workspace.t(`ui.ws.task.priority.${task.priority}`)}
								/>
							</li>
						{:else}<li class="text-muted-foreground px-4 py-6 text-center text-sm">
								{workspace.t('ui.ws.contacts.no_tasks')}
							</li>{/each}
					</ul>
				</Tabs.Content>

				<Tabs.Content value="documents"><AttachmentPanel target={{ kind: 'contact', id: contact.id }} /></Tabs.Content>
				<Tabs.Content value="comments">
					<CommentThread
						target={{ kind: 'contact', id: contact.id }}
						context={{ label: contactName(contact), path: `/contacts/${contact.id}?tab=comments` }}
						{people}
					/>
				</Tabs.Content>
				<Tabs.Content value="activity"><ObjectTimeline targetId={contact.id} {people} /></Tabs.Content>
			</Tabs.Root>
		{/snippet}
	</AsyncView>
</ModuleGate>

<ContactFormSheet bind:this={sheet} />
<ConfirmDialog bind:request={confirm} />
