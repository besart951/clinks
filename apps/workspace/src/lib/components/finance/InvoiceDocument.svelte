<script lang="ts">
	import QrBill from './QrBill.svelte';
	import { invoiceTotals, lineNet } from '$lib/domain/money';
	import { contactName } from '$lib/data/workspace-api';
	import type { Contact, Invoice, Tenant } from '$lib/domain/types';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { invoice, contact, tenant }: { invoice: Invoice; contact: Contact | null; tenant: Tenant } = $props();
	const workspace = useWorkspace();
	const totals = $derived(invoiceTotals(invoice));
</script>

<article
	class="invoice-document bg-white p-8 text-[13px] text-zinc-900 shadow-sm sm:p-12"
	aria-label={workspace.t('ui.ws.invoice.document', { number: invoice.number })}
>
	<header class="mb-10 flex justify-between gap-6">
		<div>
			{#if tenant.logoDataUrl}<img src={tenant.logoDataUrl} alt="" class="mb-2 h-10" />{:else}<p
					class="text-lg font-bold"
					style:color={tenant.brandColor}
				>
					{tenant.name}
				</p>{/if}
			<p class="text-zinc-500">
				{tenant.address.street}<br />{tenant.address.zip}
				{tenant.address.city}<br />{tenant.vatNumber}
			</p>
		</div>
		{#if contact}
			<address class="pt-8 not-italic">
				{contactName(contact)}<br />{contact.address.street}<br />{contact.address.zip}
				{contact.address.city}
			</address>
		{/if}
	</header>
	<h2 class="mb-1 text-xl font-bold">
		{workspace.t(invoice.kind === 'credit_note' ? 'ui.ws.invoice.credit_note' : 'ui.ws.invoice.invoice')}
		{invoice.number}
	</h2>
	<p class="mb-6 text-zinc-500">
		{workspace.t('ui.ws.invoice.dates', {
			issued: workspace.i18n.date(invoice.issueDate),
			due: workspace.i18n.date(invoice.dueDate),
		})}
	</p>
	<table class="mb-6 w-full">
		<thead
			><tr class="border-b border-zinc-300 text-left"
				><th class="py-2 font-semibold">{workspace.t('ui.ws.invoice.position')}</th><th
					class="py-2 text-right font-semibold">{workspace.t('ui.ws.invoice.quantity')}</th
				><th class="py-2 text-right font-semibold">{workspace.t('ui.ws.invoice.unit_price')}</th><th
					class="py-2 text-right font-semibold">{workspace.t('ui.ws.invoice.vat')}</th
				><th class="py-2 text-right font-semibold">{workspace.t('ui.ws.invoice.amount')}</th></tr
			></thead
		>
		<tbody>
			{#each invoice.lines as line, index (index)}
				<tr class="border-b border-zinc-100"
					><td class="py-2 pr-4">{line.description}</td><td class="py-2 text-right tabular-nums"
						>{workspace.i18n.number(line.quantity)}</td
					><td class="py-2 text-right tabular-nums">{workspace.i18n.money(line.unitPrice)}</td><td
						class="py-2 text-right tabular-nums">{workspace.i18n.percent(line.vatRate)}</td
					><td class="py-2 text-right tabular-nums">{workspace.i18n.money(lineNet(line))}</td></tr
				>
			{/each}
		</tbody>
	</table>
	<dl class="ml-auto mb-8 w-64 space-y-1 tabular-nums">
		<div class="flex justify-between">
			<dt>{workspace.t('ui.ws.invoice.net')}</dt>
			<dd>{workspace.i18n.money(totals.net)}</dd>
		</div>
		{#each totals.shares.filter((share) => share.rate > 0) as share (share.rate)}
			<div class="flex justify-between text-zinc-500">
				<dt>
					{workspace.t('ui.ws.invoice.vat_on', {
						rate: workspace.i18n.percent(share.rate),
						net: workspace.i18n.money(share.net),
					})}
				</dt>
				<dd>{workspace.i18n.money(share.vat)}</dd>
			</div>
		{/each}
		<div class="flex justify-between border-t border-zinc-300 pt-1 font-bold">
			<dt>{workspace.t('ui.ws.invoice.total')}</dt>
			<dd>{workspace.i18n.money(totals.gross)}</dd>
		</div>
	</dl>
	{#if invoice.notes}<p class="mb-8 whitespace-pre-wrap">{invoice.notes}</p>{/if}
	<p class="mb-8 text-zinc-500">{workspace.t('ui.ws.invoice.thanks')}</p>
	<QrBill
		{tenant}
		{contact}
		amount={totals.balance > 0 ? totals.balance : totals.gross}
		reference={workspace.t('ui.ws.invoice.reference', { number: invoice.number })}
	/>
</article>
