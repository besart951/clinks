<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Printer from '@lucide/svelte/icons/printer';
	import Send from '@lucide/svelte/icons/send';
	import Banknote from '@lucide/svelte/icons/banknote';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as Dialog from '@clinks/ui-shared/components/ui/dialog';
	import * as DropdownMenu from '@clinks/ui-shared/components/ui/dropdown-menu';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import { invoiceTone } from '#lib/components/common/tones';
	import CommentThread from '#lib/components/collaboration/CommentThread.svelte';
	import AttachmentPanel from '#lib/components/collaboration/AttachmentPanel.svelte';
	import ObjectTimeline from '#lib/components/collaboration/ObjectTimeline.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import InvoiceDocument from '#lib/components/finance/InvoiceDocument.svelte';
	import { InvoiceDetailModel } from '#lib/features/finance/invoice-detail.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { today } from '#lib/domain/dates';
	import type { InvoiceId } from '#lib/domain/ids';
	import { href, navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new InvoiceDetailModel(workspace, page.params.id as InvoiceId);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(workspace.session.can('finance.write'));
	let paymentOpen = $state(false);
	let paymentAmount = $state('');
	let paymentDate = $state(today());
	let confirm = $state<ConfirmRequest | null>(null);

	onMount(() => {
		void people.load();
		return model.resource.connect();
	});

	function openPayment() {
		paymentAmount = ((model.totals?.balance ?? 0) / 100).toFixed(2);
		paymentDate = today();
		paymentOpen = true;
	}

	async function savePayment(event: SubmitEvent) {
		event.preventDefault();
		const amount = Math.round(Number(paymentAmount.replace(',', '.')) * 100);
		if (!amount) return;
		if (await model.recordPayment(amount, paymentDate)) paymentOpen = false;
	}

	function sendByMail() {
		const data = model.resource.value;
		const to = data.contact?.email ?? '';
		const subject = encodeURIComponent(
			workspace.t('ui.ws.invoice.mail_subject', {
				number: data.invoice.number,
				company: workspace.session.tenant?.name ?? '',
			}),
		);
		void navigate(`/mail?compose=1&to=${encodeURIComponent(to)}&subject=${subject}`);
	}

	function askCancel() {
		confirm = {
			title: workspace.t('ui.ws.invoice.cancel_title'),
			description: workspace.t('ui.ws.invoice.cancel_text'),
			confirmLabel: workspace.t('ui.ws.invoice.cancel_action'),
			destructive: true,
			onConfirm: () => model.cancel().then(() => undefined),
		};
	}

	async function duplicate() {
		const copy = await model.duplicate();
		if (copy) await navigate(`/finance/invoices/${copy.id}/edit`);
	}

	async function remove() {
		if (await model.remove()) await navigate('/finance');
	}
</script>

<svelte:head>
	<title>{model.resource.data?.invoice.number ?? workspace.t('ui.ws.module.finance')} · CLinks</title>
</svelte:head>

<ModuleGate module="finance" permission="finance.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ invoice, contact })}
			{@const totals = model.totals!}
			{@const status = model.status}
			<div class="print:hidden">
				<PageHeader
					title={workspace.t('ui.ws.invoice.document', { number: invoice.number })}
					crumbs={[{ label: workspace.t('ui.ws.module.finance'), path: '/finance' }, { label: invoice.number }]}
				>
					{#snippet actions()}
						<StatusBadge tone={invoiceTone[status]} label={workspace.t(`ui.ws.invoice.status.${status}`)} />
						{#if canWrite && invoice.status === 'draft'}
							<Button variant="outline" href={href(`/finance/invoices/${invoice.id}/edit`)}>
								<Pencil class="size-4" />{workspace.t('ui.ws.edit')}
							</Button>
							<Button onclick={() => model.issue()}>{workspace.t('ui.ws.invoice.issue')}</Button>
						{/if}
						{#if canWrite && ['open', 'partially_paid', 'overdue', 'reminded'].includes(status)}
							<Button variant="outline" onclick={openPayment}>
								<Banknote class="size-4" />{workspace.t('ui.ws.invoice.record_payment')}
							</Button>
							{#if status === 'overdue' || status === 'reminded'}<Button
									variant="outline"
									onclick={() => model.sendReminder()}
								>
									<BellRing class="size-4" />{workspace.t('ui.ws.invoice.send_reminder', {
										level: invoice.reminderLevel + 1,
									})}
								</Button>{/if}
						{/if}
						<Button variant="outline" onclick={() => window.print()}>
							<Printer class="size-4" />{workspace.t('ui.ws.invoice.print')}
						</Button>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}<Button
										{...props}
										variant="outline"
										size="icon"
										aria-label={workspace.t('ui.ws.more_actions')}
									>
										<Ellipsis class="size-4" />
									</Button>{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								{#if workspace.session.hasModule('mail') && workspace.session.can('mail.write')}<DropdownMenu.Item
										onclick={sendByMail}
									>
										<Send class="size-4" />{workspace.t('ui.ws.invoice.send_mail')}
									</DropdownMenu.Item>{/if}
								{#if canWrite}
									<DropdownMenu.Item onclick={duplicate}>{workspace.t('ui.ws.campaign.duplicate')}</DropdownMenu.Item>
									{#if invoice.status !== 'draft' && invoice.status !== 'cancelled'}<DropdownMenu.Item
											variant="destructive"
											onclick={askCancel}
										>
											{workspace.t('ui.ws.invoice.cancel_action')}
										</DropdownMenu.Item>{/if}
									{#if invoice.status === 'draft'}<DropdownMenu.Item variant="destructive" onclick={remove}>
											{workspace.t('ui.ws.delete')}
										</DropdownMenu.Item>{/if}
								{/if}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{/snippet}
				</PageHeader>
			</div>
			<div class="grid gap-6 xl:grid-cols-[1fr_22rem]">
				<div
					class="overflow-x-auto rounded-xl border bg-zinc-100 p-2 sm:p-6 print:border-0 print:bg-white print:p-0 dark:bg-zinc-900"
				>
					{#if workspace.session.tenant}<InvoiceDocument {invoice} {contact} tenant={workspace.session.tenant} />{/if}
				</div>
				<div class="space-y-6 print:hidden">
					<Card.Root>
						<Card.Header><Card.Title>{workspace.t('ui.ws.invoice.overview')}</Card.Title></Card.Header>
						<Card.Content>
							<dl class="space-y-2 text-sm">
								<div class="flex justify-between gap-2">
									<dt class="text-muted-foreground">{workspace.t('ui.ws.finance.recipient')}</dt>
									<dd>
										{#if contact}<a class="hover:underline" href={href(`/contacts/${contact.id}`)}>
												{contactName(contact)}
											</a>{:else}—{/if}
									</dd>
								</div>
								<div class="flex justify-between gap-2">
									<dt class="text-muted-foreground">{workspace.t('ui.ws.invoice.total')}</dt>
									<dd class="tabular-nums">{workspace.i18n.money(totals.gross)}</dd>
								</div>
								<div class="flex justify-between gap-2">
									<dt class="text-muted-foreground">{workspace.t('ui.ws.invoice.paid')}</dt>
									<dd class="tabular-nums">{workspace.i18n.money(totals.paid)}</dd>
								</div>
								<div class="flex justify-between gap-2 font-semibold">
									<dt>{workspace.t('ui.ws.finance.balance')}</dt>
									<dd class="tabular-nums">{workspace.i18n.money(Math.max(totals.balance, 0))}</dd>
								</div>
								{#if invoice.reminderLevel > 0}<div class="flex justify-between gap-2">
										<dt class="text-muted-foreground">{workspace.t('ui.ws.invoice.reminders')}</dt>
										<dd>{invoice.reminderLevel}</dd>
									</div>{/if}
							</dl>
							{#if invoice.payments.length > 0}
								<h3 class="mt-4 mb-1 text-sm font-medium">{workspace.t('ui.ws.invoice.payments')}</h3>
								<ul class="text-sm">
									{#each invoice.payments as payment, index (index)}<li class="flex justify-between">
											<span>{workspace.i18n.date(payment.date)}</span><span class="tabular-nums">
												{workspace.i18n.money(payment.amount)}
											</span>
										</li>{/each}
								</ul>
							{/if}
						</Card.Content>
					</Card.Root>
					<Card.Root>
						<Card.Content>
							<Tabs.Root value="comments">
								<Tabs.List class="mb-3">
									<Tabs.Trigger value="comments">{workspace.t('ui.ws.comments.title')}</Tabs.Trigger><Tabs.Trigger
										value="files"
									>
										{workspace.t('ui.ws.documents.attachments')}
									</Tabs.Trigger><Tabs.Trigger value="activity">{workspace.t('ui.ws.nav.activity')}</Tabs.Trigger>
								</Tabs.List>
								<Tabs.Content value="comments">
									<CommentThread
										target={{ kind: 'invoice', id: invoice.id }}
										context={{ label: invoice.number, path: `/finance/invoices/${invoice.id}` }}
										{people}
									/>
								</Tabs.Content>
								<Tabs.Content value="files">
									<AttachmentPanel target={{ kind: 'invoice', id: invoice.id }} />
								</Tabs.Content>
								<Tabs.Content value="activity"><ObjectTimeline targetId={invoice.id} {people} /></Tabs.Content>
							</Tabs.Root>
						</Card.Content>
					</Card.Root>
				</div>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>

<Dialog.Root bind:open={paymentOpen}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-sm">
		<Dialog.Header><Dialog.Title>{workspace.t('ui.ws.invoice.record_payment')}</Dialog.Title></Dialog.Header>
		<form id="payment-form" class="space-y-3" onsubmit={savePayment}>
			<FormField id="pay-amount" label={workspace.t('ui.ws.finance.unit_price_chf')}>
				<Input id="pay-amount" inputmode="decimal" bind:value={paymentAmount} />
			</FormField>
			<FormField id="pay-date" label={workspace.t('ui.ws.invoice.payment_date')}>
				<Input id="pay-date" type="date" bind:value={paymentDate} />
			</FormField>
		</form>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (paymentOpen = false)}>{workspace.t('ui.ws.cancel')}</Button><Button
				type="submit"
				form="payment-form"
			>
				{workspace.t('ui.save')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
<ConfirmDialog bind:request={confirm} />
