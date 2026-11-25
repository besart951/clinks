<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Send from '@lucide/svelte/icons/send';
	import Archive from '@lucide/svelte/icons/archive';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import House from '@lucide/svelte/icons/house';
	import Phone from '@lucide/svelte/icons/phone';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import { invoiceTone } from '#lib/components/common/tones';
	import CommentThread from '#lib/components/collaboration/CommentThread.svelte';
	import AttachmentPanel from '#lib/components/collaboration/AttachmentPanel.svelte';
	import ObjectTimeline from '#lib/components/collaboration/ObjectTimeline.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import DetailHeader from '#lib/components/kit/DetailHeader.svelte';
	import Accordion from '@clinks/ui/kit/Accordion.svelte';
	import AccordionSection from '#lib/components/kit/AccordionSection.svelte';
	import AttributeList from '#lib/components/kit/AttributeList.svelte';
	import InlineText from '#lib/components/kit/InlineText.svelte';
	import TagEditor from '#lib/components/kit/TagEditor.svelte';
	import SideCard from '@clinks/ui/kit/SideCard.svelte';
	import PastToggle from '@clinks/ui/kit/PastToggle.svelte';
	import AppointmentRow from '#lib/components/kit/AppointmentRow.svelte';
	import { personBadge } from '@clinks/ui/kit/avatar';
	import { ContactDetailModel } from '#lib/features/contacts/contact-detail.svelte';
	import { contactFields } from '#lib/features/contacts/contact-fields';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { effectiveStatus, invoiceTotals } from '@clinks/domain/money';
	import { today } from '@clinks/domain/dates';
	import type { ContactId } from '@clinks/domain/ids';
	import { href, navigate } from '#lib/navigation';
	import { useQuickCreate } from '#lib/features/shell/quick-create.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const quick = useQuickCreate();
	const session = workspace.session;
	const id = page.params.id as ContactId;
	const model = new ContactDetailModel(workspace, id);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(session.can('contacts.write'));
	const text = { t: workspace.t.bind(workspace), date: (value: string) => workspace.i18n.date(value) };
	let confirm = $state<ConfirmRequest | null>(null);

	onMount(() => {
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

<svelte:head>
	<title
		>{model.resource.data ? contactName(model.resource.data.contact) : workspace.t('ui.ws.module.contacts')} · CLinks</title
	>
</svelte:head>

<ModuleGate permission="contacts.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ contact, appointments, invoices, mails, tasks })}
			{@const now = new Date().toISOString()}
			{@const upcoming = appointments.filter((entry) => entry.start >= now).reverse()}
			{@const past = appointments.filter((entry) => entry.start < now)}
			{@const openInvoices = invoices.filter((entry) => effectiveStatus(entry, today()) !== 'paid')}
			{@const paidInvoices = invoices.filter((entry) => effectiveStatus(entry, today()) === 'paid')}
			{@const openTasks = tasks.filter((entry) => entry.status !== 'done')}
			{@const doneTasks = tasks.filter((entry) => entry.status === 'done')}
			{#snippet invoiceRow(invoice: (typeof invoices)[number])}
				{@const status = effectiveStatus(invoice, today())}
				<a
					class="hover:bg-accent grid h-10 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-1 text-[13px]"
					href={href(`/finance/invoices/${invoice.id}`)}
				>
					<span class="truncate">
						<b class="font-mono text-xs font-medium">{invoice.number}</b>
						<span class="text-muted-foreground">{workspace.i18n.date(invoice.issueDate)}</span>
					</span>
					<span class="tabular-nums">{workspace.i18n.money(invoiceTotals(invoice).gross)}</span>
					<StatusBadge tone={invoiceTone[status]} label={workspace.t(`ui.ws.invoice.status.${status}`)} />
				</a>
			{/snippet}

			{#snippet taskRow(task: (typeof tasks)[number])}
				<a
					class="hover:bg-accent flex h-9 items-center gap-2 rounded-md px-1 text-[13px]"
					href={href(`/planner/${task.id}`)}
				>
					<span
						class="size-2 shrink-0 rounded-full {task.status === 'done' ? 'bg-success' : 'bg-input'}"
						aria-hidden="true"
					></span>
					<span class="flex-1 truncate {task.status === 'done' ? 'text-muted-foreground line-through' : ''}">
						{task.title}
					</span>
					{#if task.dueDate}<span class="text-muted-foreground text-xs">{workspace.i18n.date(task.dueDate)}</span>{/if}
				</a>
			{/snippet}

			{#snippet mailRow(mail: (typeof mails)[number])}
				<a
					class="hover:bg-accent grid gap-0.5 rounded-md px-1 py-1.5 text-[13px]"
					href={href(`/mail?folder=${mail.folder}&message=${mail.id}`)}
				>
					<span class="truncate font-medium">{mail.subject || workspace.t('ui.ws.mail.no_subject')}</span>
					<span class="text-muted-foreground text-xs">
						{workspace.i18n.dateTime(mail.sentAt)} · {workspace.t(`ui.ws.mail.folder.${mail.folder}`)}
					</span>
				</a>
			{/snippet}
			<DetailHeader
				header={{
					title: contactName(contact),
					back: { label: workspace.t('ui.ws.module.contacts'), path: '/contacts' },
					avatar: personBadge(contactName(contact)),
					meta: [workspace.t(`ui.ws.contacts.kind_${contact.kind}`)],
					badges: contact.archived ? [workspace.t('ui.ws.contacts.is_archived')] : [],
				}}
			>
				{#snippet actions()}
					{#if contact.phone}<Button
							variant="ghost"
							size="icon-sm"
							href="tel:{contact.phone}"
							aria-label={contact.phone}
						>
							<Phone class="size-4" />
						</Button>{/if}
					{#if contact.tags.includes('Patient:in') && session.hasModule('physio')}
						<Button variant="outline" size="sm" href={href(`/physio/${contact.id}`)}>
							<HeartPulse class="size-4" />{workspace.t('ui.ws.physio.open_record')}
						</Button>
					{/if}
					{#if contact.tags.includes('Klient:in') && session.hasModule('spitex')}
						<Button variant="outline" size="sm" href={href(`/spitex/clients/${contact.id}`)}>
							<House class="size-4" />{workspace.t('ui.ws.spitex.open_client')}
						</Button>
					{/if}
					{#if session.can('calendar.write')}<Button
							variant="outline"
							size="sm"
							onclick={() => quick.appointment({ contactId: contact.id })}
						>
							<CalendarPlus class="size-4" />{workspace.t('ui.ws.command.new_appointment')}
						</Button>{/if}
					{#if session.can('finance.write') && session.hasModule('finance')}<Button
							size="sm"
							onclick={() => navigate(`/finance/invoices/new?contact=${contact.id}`)}
						>
							<ReceiptText class="size-4" />{workspace.t('ui.ws.command.new_invoice')}
						</Button>{/if}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									aria-label={workspace.t('ui.ws.more_actions')}
								>
									<Ellipsis class="size-4" />
								</Button>{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#if session.can('mail.write') && session.hasModule('mail') && contact.email}<DropdownMenu.Item
									onclick={() => quick.mail({ to: [contact.email] })}
								>
									<Send class="size-4" />{workspace.t('ui.ws.command.new_mail')}
								</DropdownMenu.Item>{/if}
							{#if canWrite}
								<DropdownMenu.Item onclick={() => model.setArchived(contact, !contact.archived)}>
									<Archive class="size-4" />{contact.archived
										? workspace.t('ui.ws.contacts.unarchive')
										: workspace.t('ui.ws.contacts.archive')}
								</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item variant="destructive" onclick={askDelete}>
									<Trash2 class="size-4" />{workspace.t('ui.ws.delete')}
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/snippet}
			</DetailHeader>

			<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<Accordion>
					<AccordionSection section={{ id: 'contact.master', title: workspace.t('ui.ws.contacts.master_data') }}>
						<AttributeList
							list={{ fields: contactFields(contact, text), readonly: !canWrite }}
							onsave={(field, value) => model.saveField(contact, field.key, value, field.label)}
						/>
					</AccordionSection>
					<AccordionSection
						section={{ id: 'contact.tags', title: workspace.t('ui.ws.field.tags'), count: contact.tags.length }}
					>
						<TagEditor tags={contact.tags} readonly={!canWrite} onsave={(tags) => model.saveTags(contact, tags)} />
					</AccordionSection>
					<AccordionSection section={{ id: 'contact.notes', title: workspace.t('ui.ws.field.notes') }}>
						<InlineText
							text={{
								value: contact.notes,
								placeholder: workspace.t('ui.ws.contacts.notes_placeholder'),
								label: workspace.t('ui.ws.field.notes'),
							}}
							readonly={!canWrite}
							onsave={(value) => model.saveField(contact, 'notes', value, workspace.t('ui.ws.field.notes'))}
						/>
					</AccordionSection>
					{#if session.can('documents.read')}
						<AccordionSection section={{ id: 'contact.documents', title: workspace.t('ui.ws.module.documents') }}>
							<AttachmentPanel target={{ kind: 'contact', id: contact.id }} />
						</AccordionSection>
					{/if}
					<AccordionSection section={{ id: 'contact.comments', title: workspace.t('ui.ws.comments.title') }}>
						<CommentThread
							target={{ kind: 'contact', id: contact.id }}
							context={{ label: contactName(contact), path: `/contacts/${contact.id}` }}
							{people}
						/>
					</AccordionSection>
					{#if session.can('audit.read')}
						<AccordionSection
							section={{ id: 'contact.history', title: workspace.t('ui.ws.contacts.history'), defaultOpen: false }}
						>
							<ObjectTimeline targetId={contact.id} {people} />
						</AccordionSection>
					{/if}
				</Accordion>

				<aside class="grid gap-4">
					{#if session.can('calendar.read')}
						<SideCard
							card={{
								title: workspace.t('ui.ws.contacts.upcoming'),
								count: upcoming.length,
								addLabel: workspace.t('ui.ws.command.new_appointment'),
							}}
							onadd={session.can('calendar.write') ? () => quick.appointment({ contactId: contact.id }) : undefined}
						>
							<div class="grid">
								{#each upcoming as appointment, index (appointment.id)}<AppointmentRow {appointment} {index} />{:else}
									<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.contacts.no_appointments')}</p>
								{/each}
							</div>
							{#if past.length > 0}
								<PastToggle label={workspace.t('ui.ws.inline.past', { count: past.length })}>
									{#each past as appointment, index (appointment.id)}<AppointmentRow {appointment} {index} />{/each}
								</PastToggle>
							{/if}
						</SideCard>
					{/if}
					{#if session.can('finance.read') && session.hasModule('finance')}
						<SideCard
							card={{
								title: workspace.t('ui.ws.command.group_invoices'),
								count: openInvoices.length,
								addLabel: workspace.t('ui.ws.command.new_invoice'),
							}}
							onadd={session.can('finance.write')
								? () => navigate(`/finance/invoices/new?contact=${contact.id}`)
								: undefined}
						>
							<div class="grid">
								{#each openInvoices as invoice (invoice.id)}{@render invoiceRow(invoice)}{:else}
									<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.contacts.no_invoices')}</p>
								{/each}
							</div>
							{#if paidInvoices.length > 0}
								<PastToggle label={workspace.t('ui.ws.contacts.paid_invoices', { count: paidInvoices.length })}>
									{#each paidInvoices as invoice (invoice.id)}{@render invoiceRow(invoice)}{/each}
								</PastToggle>
							{/if}
						</SideCard>
					{/if}
					{#if session.can('planner.read') && session.hasModule('planner')}
						<SideCard
							card={{
								title: workspace.t('ui.ws.contacts.open_tasks'),
								count: openTasks.length,
								addLabel: workspace.t('ui.ws.command.new_task'),
							}}
							onadd={session.can('planner.write') ? () => quick.task({ contactId: contact.id }) : undefined}
						>
							<div class="grid">
								{#each openTasks as task (task.id)}{@render taskRow(task)}{:else}
									<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.contacts.no_tasks')}</p>
								{/each}
							</div>
							{#if doneTasks.length > 0}
								<PastToggle label={workspace.t('ui.ws.contacts.done_tasks', { count: doneTasks.length })}>
									{#each doneTasks as task (task.id)}{@render taskRow(task)}{/each}
								</PastToggle>
							{/if}
						</SideCard>
					{/if}
					{#if session.can('mail.read') && session.hasModule('mail')}
						<SideCard
							card={{
								title: workspace.t('ui.ws.command.group_mails'),
								count: mails.length,
								addLabel: workspace.t('ui.ws.command.new_mail'),
							}}
							onadd={session.can('mail.write') && contact.email ? () => quick.mail({ to: [contact.email] }) : undefined}
						>
							<div class="grid">
								{#each mails.slice(0, 3) as mail (mail.id)}{@render mailRow(mail)}{:else}
									<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.contacts.no_mails')}</p>
								{/each}
							</div>
							{#if mails.length > 3}
								<PastToggle label={workspace.t('ui.ws.contacts.older_mails', { count: mails.length - 3 })}>
									{#each mails.slice(3) as mail (mail.id)}{@render mailRow(mail)}{/each}
								</PastToggle>
							{/if}
						</SideCard>
					{/if}
				</aside>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>

<ConfirmDialog bind:request={confirm} />
