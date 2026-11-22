<script lang="ts">
	import QRCode from 'qrcode';
	import { formatIban, isValidSwissIban, qrBillPayload } from '#lib/domain/qr-bill';
	import { contactName } from '#lib/data/workspace-api';
	import type { Contact, Rappen, Tenant } from '#lib/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		tenant,
		contact,
		amount,
		reference,
	}: { tenant: Tenant; contact: Contact | null; amount: Rappen; reference: string } = $props();
	const workspace = useWorkspace();
	const valid = $derived(isValidSwissIban(tenant.iban));
	const payload = $derived(
		qrBillPayload({
			iban: tenant.iban,
			creditor: { name: tenant.name, address: tenant.address },
			debtor: contact ? { name: contactName(contact), address: contact.address } : null,
			amount,
			message: reference,
		}),
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
				{formatIban(tenant.iban)}<br />{tenant.name}<br />{tenant.address.street}<br />{tenant.address.zip}
				{tenant.address.city}
			</dd>
		</div>
		<div>
			<dt class="font-bold">{workspace.t('ui.ws.invoice.additional_info')}</dt>
			<dd>{reference}</dd>
		</div>
		{#if contact}<div>
				<dt class="font-bold">{workspace.t('ui.ws.invoice.payable_by')}</dt>
				<dd>{contactName(contact)}<br />{contact.address.street}<br />{contact.address.zip} {contact.address.city}</dd>
			</div>{/if}
	</dl>
</section>
