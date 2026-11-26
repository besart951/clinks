<script lang="ts">
	import { streetLine } from '@clinks/domain/address';
	import QRCode from 'qrcode';
	import { formatIban, formatReference, paymentDetails, qrBillPayload } from '@clinks/domain/qr-bill';
	import { contactName } from '#lib/data/workspace-api';
	import type { Contact, Rappen, Tenant } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		tenant,
		contact,
		amount,
		number,
		message,
	}: { tenant: Tenant; contact: Contact | null; amount: Rappen; number: string; message: string } = $props();
	const workspace = useWorkspace();
	/** Account and reference: a QR reference with a QR-IBAN, else a creditor reference; a draft has no number yet. */
	const details = $derived(paymentDetails(tenant, number));
	const valid = $derived(details !== null);
	const payload = $derived(
		details
			? qrBillPayload({
					iban: details.iban,
					creditor: { name: tenant.name, address: tenant.address },
					debtor: contact ? { name: contactName(contact), address: contact.address } : null,
					amount,
					reference: details.reference,
					message,
				})
			: '',
	);
	let svg = $state('');

	$effect(() => {
		if (!valid) return;
		void QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 }).then((value) => (svg = value));
	});
</script>

<section
	class="grid gap-6 border-t border-dashed pt-6 text-[11px] leading-snug sm:grid-cols-[13rem_1fr]"
	aria-label={workspace.t('ui.ws.invoice.qr_bill')}
>
	<div class="space-y-2">
		<p class="text-sm font-bold">{workspace.t('ui.ws.invoice.payment_part')}</p>
		{#if valid && svg}
			<div class="relative size-44">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html svg}
				<span
					class="absolute top-1/2 left-1/2 grid size-8 -translate-1/2 place-items-center border-2 border-white bg-black text-lg font-bold text-white"
					aria-hidden="true"
				>
					+
				</span>
			</div>
		{:else}
			<p class="text-destructive">{workspace.t('ui.ws.invoice.qr_missing_iban')}</p>
		{/if}
		<p>
			<span class="font-bold">{workspace.t('ui.ws.invoice.currency')}</span> CHF ·
			<span class="font-bold">{workspace.t('ui.ws.invoice.amount')}</span>
			{(amount / 100).toFixed(2)}
		</p>
	</div>
	<dl class="space-y-2">
		<div>
			<dt class="font-bold">{workspace.t('ui.ws.invoice.account')}</dt>
			<dd>
				{formatIban(details?.iban ?? tenant.iban)}<br />{tenant.name}<br />{streetLine(tenant.address)}<br />{tenant
					.address.zip}
				{tenant.address.city}
			</dd>
		</div>
		{#if details?.reference}<div>
				<dt class="font-bold">{workspace.t('ui.ws.invoice.reference_label')}</dt>
				<dd class="tabular-nums">{formatReference(details.reference)}</dd>
			</div>{/if}
		<div>
			<dt class="font-bold">{workspace.t('ui.ws.invoice.additional_info')}</dt>
			<dd>{message}</dd>
		</div>
		{#if contact}<div>
				<dt class="font-bold">{workspace.t('ui.ws.invoice.payable_by')}</dt>
				<dd>
					{contactName(contact)}<br />{streetLine(contact.address)}<br />{contact.address.zip}
					{contact.address.city}
				</dd>
			</div>{/if}
	</dl>
</section>
