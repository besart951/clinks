<script lang="ts">
	import { streetLine } from '@clinks/domain/address';
	import QrBill from './QrBill.svelte';
	import { invoiceTotals, lineNet } from '@clinks/domain/money';
	import { contactName } from '#lib/data/workspace-api';
	import type { Contact, Invoice, Tenant } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { invoice, contact, tenant }: { invoice: Invoice; contact: Contact | null; tenant: Tenant } = $props();
	const workspace = useWorkspace();
	const totals = $derived(invoiceTotals(invoice));
	/** A4 at 96 dpi. Narrower screens show the whole page scaled down, as it will print. */
	const pageWidth = 794;
	// Start from the window, so a phone does not draw one frame at full A4 width before measuring.
	let available = $state(typeof innerWidth === 'number' ? Math.min(pageWidth, innerWidth) : pageWidth);
	const fit = $derived(Math.min(1, available / pageWidth));
</script>

<div bind:clientWidth={available} style:--fit={fit}>
	<article
		class="invoice-document mx-auto w-[210mm] bg-white p-12 text-[13px] text-zinc-900 shadow-sm [zoom:var(--fit,1)] print:w-auto print:[zoom:1]"
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
					{streetLine(tenant.address)}<br />{tenant.address.zip}
					{tenant.address.city}<br />{tenant.vatNumber}
				</p>
			</div>
			{#if contact}
				<address class="pt-8 not-italic">
					{contactName(contact)}<br />{streetLine(contact.address)}<br />{contact.address.zip}
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
			{#if invoice.serviceFrom && invoice.serviceTo}<br />{invoice.serviceFrom === invoice.serviceTo
					? workspace.t('ui.ws.invoice.service_date', { date: workspace.i18n.date(invoice.serviceFrom) })
					: workspace.t('ui.ws.invoice.service_period', {
							from: workspace.i18n.date(invoice.serviceFrom),
							to: workspace.i18n.date(invoice.serviceTo),
						})}{/if}
		</p>
		<table class="mb-6 w-full">
			<thead>
				<tr class="border-b border-zinc-300 text-left">
					<th class="py-2 font-semibold">{workspace.t('ui.ws.invoice.position')}</th><th
						class="py-2 text-right font-semibold"
					>
						{workspace.t('ui.ws.invoice.quantity')}
					</th><th class="py-2 text-right font-semibold">{workspace.t('ui.ws.invoice.unit_price')}</th><th
						class="py-2 text-right font-semibold"
					>
						{workspace.t('ui.ws.invoice.vat')}
					</th><th class="py-2 text-right font-semibold">{workspace.t('ui.ws.invoice.amount')}</th>
				</tr>
			</thead>
			<tbody>
				{#each invoice.lines as line, index (index)}
					<tr class="border-b border-zinc-100">
						<td class="py-2 pr-4">{line.description}</td><td class="py-2 text-right tabular-nums">
							{workspace.i18n.number(line.quantity)}
						</td><td class="py-2 text-right tabular-nums">{workspace.i18n.money(line.unitPrice)}</td><td
							class="py-2 text-right tabular-nums"
						>
							{workspace.i18n.percent(line.vatRate)}
						</td><td class="py-2 text-right tabular-nums">{workspace.i18n.money(lineNet(line))}</td>
					</tr>
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
		{#if tenant.invoiceSettings.footer}<p class="mb-8 text-xs whitespace-pre-wrap text-zinc-500">
				{tenant.invoiceSettings.footer}
			</p>{/if}
		<QrBill
			{tenant}
			{contact}
			amount={totals.balance > 0 ? totals.balance : totals.gross}
			number={invoice.status === 'draft' && !invoice.number.match(/^\d/) ? '' : invoice.number}
			message={workspace.t('ui.ws.invoice.reference', { number: invoice.number })}
		/>
	</article>
</div>
