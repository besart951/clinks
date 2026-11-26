import { defaultDelivery, type DeliveryMethod } from '@clinks/domain/invoicing';
import type { InvoiceId } from '@clinks/domain/ids';
import type { Contact, Invoice, InvoiceSend } from '@clinks/domain/types';
import type { Workspace } from '../../workspace.svelte.ts';

/** «Senden» on an issued invoice and its send log. */
export class InvoiceSendModel {
	open = $state(false);
	to = $state('');
	method = $state<DeliveryMethod>('link');
	zip = $state('');
	busy = $state(false);
	sends = $state<InvoiceSend[] | null>(null);
	readonly #workspace: Workspace;
	readonly #invoiceId: InvoiceId;

	constructor(workspace: Workspace, invoiceId: InvoiceId) {
		this.#workspace = workspace;
		this.#invoiceId = invoiceId;
	}

	/** A link opens only with the postcode, so it cannot go to a contact without one. */
	get blocked() {
		return this.method === 'link' && this.zip.trim() === '';
	}

	get replyTo() {
		const tenant = this.#workspace.session.tenant;
		return tenant?.invoiceSettings.replyTo || this.#workspace.session.user?.email || '';
	}

	async load() {
		const sends = await this.#workspace.run(() => this.#workspace.invoiceDelivery.sends(this.#invoiceId));
		if (sends) this.sends = sends;
	}

	show(contact: Contact | null) {
		const tenant = this.#workspace.session.tenant;
		this.to = contact?.email ?? '';
		this.zip = contact?.address.zip ?? '';
		this.method = tenant ? defaultDelivery(tenant.invoiceSettings, tenant) : 'link';
		this.open = true;
	}

	async submit(invoice: Invoice) {
		if (this.blocked || this.busy) return;
		this.busy = true;
		try {
			const to = this.to.trim();
			const sent = await this.#workspace.run(
				() => this.#workspace.invoiceDelivery.send(invoice.id, { to, method: this.method }),
				{ success: 'ui.ws.invoice.sent', successParams: { number: invoice.number, to } },
			);
			if (!sent) return;
			this.open = false;
			this.sends = [sent, ...(this.sends ?? [])];
		} finally {
			this.busy = false;
		}
	}

	demoLink(send: InvoiceSend) {
		return this.#workspace.invoiceDelivery.demoLink(send);
	}
}
