import type { InvoiceLinkDetails, InvoiceLinkFile, InvoiceSendInput } from '@clinks/contracts/finance';
import { newId, type InvoiceId, type InvoiceSendId, type MailId } from '@clinks/domain/ids';
import { linkAttempts, linkLifetimeDays, nextReminder, samePostcode } from '@clinks/domain/invoicing';
import { today } from '@clinks/domain/dates';
import type { Invoice, InvoiceReminder, InvoiceSend, MailMessage } from '@clinks/domain/types';
import { bundleFor, interpolate, type Locale } from '@clinks/i18n-types/catalog';
import { MockApiError, stamp, type MockInvoiceSend, type WorkspaceCache } from './database.ts';
import type { MockInvoiceArchive } from './mock-invoice-archive.ts';
import { appendAudit, type RequestContext } from './repository.ts';

/**
 * The demo's stand-in for sending invoices (apps/api services/invoices.ts). Nothing leaves the browser: the mail
 * lands in Mail › Gesendet, and a secure link opens here with the contact's postcode, as the recipient would.
 */
export class MockInvoiceSends {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;
	readonly #archive: MockInvoiceArchive;

	constructor(db: WorkspaceCache, context: RequestContext, archive: MockInvoiceArchive) {
		this.#db = db;
		this.#context = context;
		this.#archive = archive;
	}

	/** The next reminder level, rendered first (the PDF library is async), then recorded and sent in one request. */
	async remind(invoiceId: InvoiceId, input: InvoiceSendInput): Promise<InvoiceSend> {
		const { tenantId } = this.#allowed('finance.write');
		const before = this.#invoice(invoiceId, tenantId);
		const tenant = this.#db.table('tenants').find((row) => row.id === tenantId)!;
		const day = today();
		const next = nextReminder(before, tenant.invoiceSettings, day);
		if (!next) throw this.#error('validation', 'error.ws.reminder_none');
		if (!next.due) throw this.#error('validation', 'error.ws.reminder_not_due');
		const reminder: InvoiceReminder = {
			level: next.level,
			date: day,
			dueDate: next.dueDate,
			fee: next.step.fee,
			documentId: null,
		};
		const archived = await this.#archive.render(invoiceId, {
			...reminder,
			text: next.step.text,
			interest: tenant.invoiceSettings.defaultInterest,
		});
		if (!archived) throw this.#error('validation', 'error.ws.invoice_not_issued');
		return this.#db.request(() => {
			const { actorId } = this.#allowed('finance.write');
			const invoice = this.#invoice(invoiceId, tenantId);
			if (invoice.reminders.length !== before.reminders.length) throw this.#error('conflict', 'error.ws.reminder_none');
			const updated: Invoice = {
				...invoice,
				reminders: [...invoice.reminders, { ...reminder, documentId: archived.document.id }],
				reminderLevel: next.level,
				revision: invoice.revision + 1,
				updatedAt: new Date().toISOString(),
			};
			this.#db.merge({ ...archived.rows, invoices: [updated] });
			return this.deliver(
				updated,
				{ kind: 'reminder', level: next.level, documentId: archived.document.id, ...input },
				actorId,
			);
		}, ['invoices', 'documents', 'folders', 'invoiceSends', 'mails', 'audit']);
	}

	async send(invoiceId: InvoiceId, input: InvoiceSendInput): Promise<InvoiceSend> {
		const { tenantId: scope } = this.#allowed('finance.write');
		const current = this.#invoice(invoiceId, scope);
		// Issued before the archive existed (the demo's seed): archived now, once, before it goes out.
		if (!current.documentId && current.status !== 'draft' && current.status !== 'cancelled')
			await this.#archive.issue(invoiceId);
		return this.#db.request(() => {
			const { tenantId, actorId } = this.#allowed('finance.write');
			const invoice = this.#invoice(invoiceId, tenantId);
			if (invoice.status === 'draft' || invoice.status === 'cancelled' || !invoice.documentId)
				throw this.#error('validation', 'error.ws.invoice_not_issued');
			return this.deliver(invoice, { kind: 'invoice', level: null, documentId: invoice.documentId, ...input }, actorId);
		}, ['invoiceSends', 'mails', 'audit']);
	}

	/** Logs one mail and files it under Mail › Gesendet; runs inside a request. */
	deliver(
		invoice: Invoice,
		delivery: Pick<InvoiceSend, 'kind' | 'level' | 'documentId' | 'method'> & { to: string },
		actorId: NonNullable<ReturnType<RequestContext['actorId']>>,
	): InvoiceSend {
		const tenant = this.#db.table('tenants').find((row) => row.id === invoice.tenantId)!;
		const contact = this.#db.table('contacts').find((row) => row.id === invoice.contactId);
		const user = this.#db.table('users').find((row) => row.id === actorId);
		const sender = this.#db
			.table('mailSenders')
			.find((row) => row.tenantId === invoice.tenantId && row.kind === 'business' && row.isDefault);
		if (delivery.method === 'link' && !contact?.address.zip.trim())
			throw this.#error('validation', 'error.ws.invoice_link_no_postcode');
		const now = new Date();
		const token = delivery.method === 'link' ? randomToken() : null;
		const row: MockInvoiceSend = {
			id: newId<InvoiceSendId>(),
			tenantId: invoice.tenantId,
			invoiceId: invoice.id,
			kind: delivery.kind,
			level: delivery.level,
			documentId: delivery.documentId,
			recipient: delivery.to,
			method: delivery.method,
			sentAt: now.toISOString(),
			sentBy: user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '',
			linkExpiresAt: token ? new Date(now.getTime() + linkLifetimeDays * 86_400_000).toISOString() : null,
			openedAt: null,
			openCount: 0,
			// The demo has no mail server: handed over at once.
			delivery: 'sent',
			token,
			attempts: 0,
		};
		this.#db.table('invoiceSends').push(row);
		const locale: Locale = tenant.locale === 'en-US' ? 'en-US' : 'de-CH';
		const bundle = bundleFor(locale);
		const t = (key: string, params: Record<string, string | number>) => interpolate(bundle.get(key) ?? key, params);
		const date = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(locale);
		const params = {
			tenant: tenant.name,
			number: invoice.number,
			level: delivery.level ?? 0,
			due: date(invoice.dueDate),
		};
		const body = token
			? t('mail.invoice.body_link', {
					...params,
					link: `${location.origin}${location.pathname}#/invoice-link/${token}`,
					expires: date(row.linkExpiresAt!),
				})
			: t(delivery.kind === 'invoice' ? 'mail.invoice.body_attachment' : 'mail.invoice.reminder_body', params);
		this.#db.table('mails').push(
			stamp<MailMessage>({
				id: newId<MailId>(),
				tenantId: invoice.tenantId,
				folder: 'sent',
				from: sender?.address ?? (tenant.invoiceSettings.replyTo || user?.email || ''),
				fromName: sender?.displayName ?? tenant.name,
				to: [delivery.to],
				subject: t(delivery.kind === 'invoice' ? 'mail.invoice.subject' : 'mail.invoice.reminder_subject', params),
				body,
				sentAt: row.sentAt,
				read: true,
				starred: false,
				contactId: invoice.contactId,
				messageId: null,
				delivery: 'sent',
			}),
		);
		appendAudit(this.#db, {
			tenantId: invoice.tenantId,
			actorId,
			action: delivery.kind === 'invoice' ? 'invoice.sent' : 'invoice.reminder_sent',
			target: { kind: 'invoice', id: invoice.id, label: invoice.number },
		});
		return view(row);
	}

	list(invoiceId: InvoiceId): Promise<InvoiceSend[]> {
		return this.#db.request(() => {
			const { tenantId } = this.#allowed('finance.read');
			return this.#db
				.table('invoiceSends')
				.filter((row) => row.tenantId === tenantId && row.invoiceId === invoiceId)
				.sort((left, right) => right.sentAt.localeCompare(left.sentAt))
				.map(view);
		});
	}

	/** The demo link of a send, for the log: in the real product only the recipient's mail holds it. */
	demoLink(sendId: InvoiceSendId): string | null {
		return this.#db.table('invoiceSends').find((row) => row.id === sendId)?.token ?? null;
	}

	linkDetails(token: string): Promise<InvoiceLinkDetails> {
		return this.#db.request(() => {
			const row = this.#link(token);
			const invoice = this.#db.table('invoices').find((candidate) => candidate.id === row.invoiceId)!;
			return {
				tenantName: this.#db.table('tenants').find((tenant) => tenant.id === row.tenantId)?.name ?? '',
				number: invoice.number,
				kind: row.kind,
				level: row.level,
				expiresAt: row.linkExpiresAt!,
			};
		});
	}

	open(token: string, postcode: string): Promise<InvoiceLinkFile> {
		return this.#db.request(() => {
			const row = this.#link(token);
			if (row.attempts >= linkAttempts) throw this.#error('validation', 'error.ws.invoice_link_locked');
			const invoice = this.#db.table('invoices').find((candidate) => candidate.id === row.invoiceId)!;
			const contact = this.#db.table('contacts').find((candidate) => candidate.id === invoice.contactId);
			if (!samePostcode(postcode, contact?.address.zip ?? '')) {
				row.attempts += 1;
				// Kept although the request fails, as the server counts it in a transaction of its own.
				this.#db.merge({ invoiceSends: [row] });
				throw this.#error(
					'validation',
					row.attempts >= linkAttempts ? 'error.ws.invoice_link_locked' : 'error.ws.invoice_link_postcode',
				);
			}
			row.openedAt ??= new Date().toISOString();
			row.openCount += 1;
			const document = this.#db.table('documents').find((candidate) => candidate.id === row.documentId);
			if (!document) throw this.#error('not_found', 'error.ws.invoice_link_invalid');
			return { name: document.name, url: document.dataUrl };
		}, ['invoiceSends']);
	}

	#link(token: string) {
		const row = this.#db
			.table('invoiceSends')
			.find((candidate) => candidate.token !== null && candidate.token === token);
		if (!row || new Date(row.linkExpiresAt!) <= new Date())
			throw this.#error('not_found', 'error.ws.invoice_link_invalid');
		return row;
	}

	#invoice(id: InvoiceId, tenantId: string) {
		const invoice = this.#db.table('invoices').find((row) => row.id === id && row.tenantId === tenantId);
		if (!invoice) throw this.#error('not_found', 'error.ws.not_found');
		return invoice;
	}

	#allowed(permission: 'finance.read' | 'finance.write') {
		const tenantId = this.#context.tenantId();
		const actorId = this.#context.actorId();
		if (!tenantId || !actorId) throw this.#error('unauthorized', 'error.unauthorized');
		if (!this.#context.can(permission)) throw this.#error('forbidden', 'error.forbidden');
		return { tenantId, actorId };
	}

	#error(code: ConstructorParameters<typeof MockApiError>[0], key: string) {
		return new MockApiError(code, this.#context.localize(key));
	}
}

function view({ token: _token, attempts: _attempts, ...row }: MockInvoiceSend): InvoiceSend {
	return row;
}

function randomToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}
