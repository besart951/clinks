import { publicRoutes, webLink } from '@clinks/contracts/public-links';
import type { Tx } from '@clinks/db/scope';
import type { InvoiceSendInput } from '@clinks/contracts/finance';
import { nextReminder, type InvoiceSettings } from '@clinks/domain/invoicing';
import type { Invoice, InvoiceReminder, InvoiceSend } from '@clinks/domain/types';
import { uuid } from '../crypto.ts';
import { ApiError } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { documentUrl } from './files.ts';
import { InvoiceArchive } from './invoice-archive.ts';
import { invoiceMail, invoiceMailContext, type Delivery } from './invoice-mail.ts';
import { defaultSender } from './mail-senders.ts';
import { issueLink, lifetimes } from './one-time.ts';
import { enqueueMail } from './outbox.ts';
import { withPermission, type MemberScope } from './permissions.ts';

/** Invoices beyond sync: the archived PDF, sending and reminding by e-mail, the send log. */
export class InvoiceService {
	readonly #services: Services;
	readonly #archive: InvoiceArchive;
	constructor(services: Services) {
		this.#services = services;
		this.#archive = new InvoiceArchive(services);
	}

	/** Where the archived PDF/A of an issued invoice can be downloaded; for anyone who may read finance. */
	pdf(claims: AccessClaims, invoiceId: string) {
		return withPermission(this.#services.db, claims, 'finance.read', async (tx) => {
			const invoice = await tx
				.selectFrom('invoices')
				.select('documentId')
				.where('id', '=', invoiceId)
				.executeTakeFirst();
			if (!invoice?.documentId) throw new ApiError(404, 'error.ws.not_found');
			return { url: await documentUrl(tx, this.#services, String(invoice.documentId)) };
		});
	}

	/** Sends the archived PDF of an issued invoice, attached or as a secure link. */
	send(claims: AccessClaims, invoiceId: string, input: InvoiceSendInput, caller: Caller) {
		return withPermission(this.#services.db, claims, 'finance.write', async (tx, scope) => {
			const invoice = await tx
				.selectFrom('invoices')
				.select(['status', 'documentId', 'pdfSha256'])
				.where('id', '=', invoiceId)
				.executeTakeFirst();
			if (!invoice) throw new ApiError(404, 'error.ws.not_found');
			if (invoice.status === 'draft' || invoice.status === 'cancelled')
				throw new ApiError(400, 'error.ws.invoice_not_issued');
			// Issued before the archive existed: archived now, once, before it goes out.
			const documentId = invoice.documentId ?? (await this.#archive.issue(tx, scope, invoiceId));
			if (!documentId) throw new ApiError(400, 'error.ws.invoice_not_issued');
			return this.deliver(
				tx,
				scope,
				{
					invoiceId,
					kind: 'invoice',
					level: null,
					documentId: String(documentId),
					sha256: invoice.documentId ? (invoice.pdfSha256 as string | null) : null,
					to: input.to,
					method: input.method,
				},
				caller,
			);
		});
	}

	/**
	 * Sends the next reminder level once it is due: renders and archives its PDF (open amount, earlier fees, its own
	 * fee and a new QR part), records it on the invoice and sends it like the invoice. Nothing is sent automatically.
	 */
	remind(claims: AccessClaims, invoiceId: string, input: InvoiceSendInput, caller: Caller) {
		return withPermission(this.#services.db, claims, 'finance.write', async (tx, scope) => {
			const row = await tx.selectFrom('invoices').selectAll().where('id', '=', invoiceId).executeTakeFirst();
			if (!row) throw new ApiError(404, 'error.ws.not_found');
			const invoice = row as unknown as Invoice;
			const tenant = await tx
				.selectFrom('tenants')
				.select(['invoiceSettings', 'timeZone'])
				.where('id', '=', scope.tenantId)
				.executeTakeFirstOrThrow();
			const settings = tenant.invoiceSettings as InvoiceSettings;
			const today = localDate(this.#services.now(), String(tenant.timeZone));
			const next = nextReminder(invoice, settings, today);
			if (!next) throw new ApiError(400, 'error.ws.reminder_none');
			if (!next.due) throw new ApiError(400, 'error.ws.reminder_not_due');
			const archived = await this.#archive.reminder(tx, scope, invoiceId, {
				level: next.level,
				date: today,
				fee: next.step.fee,
				dueDate: next.dueDate,
				text: next.step.text,
				interest: settings.defaultInterest,
			});
			if (!archived) throw new ApiError(400, 'error.ws.invoice_not_issued');
			const reminder: InvoiceReminder = {
				level: next.level,
				date: today,
				dueDate: next.dueDate,
				fee: next.step.fee,
				documentId: archived.documentId as InvoiceReminder['documentId'],
			};
			await tx
				.updateTable('invoices')
				.set((eb) => ({
					reminders: JSON.stringify([...invoice.reminders, reminder]),
					reminderLevel: next.level,
					revision: eb('revision', '+', 1),
					updatedAt: this.#services.now(),
				}))
				.where('id', '=', invoiceId)
				.execute();
			return this.deliver(
				tx,
				scope,
				{
					invoiceId,
					kind: 'reminder',
					level: next.level,
					documentId: archived.documentId,
					sha256: archived.sha256,
					to: input.to,
					method: input.method,
				},
				caller,
			);
		});
	}

	/** The mails sent for an invoice, newest first. */
	sends(claims: AccessClaims, invoiceId: string) {
		return withPermission(this.#services.db, claims, 'finance.read', (tx) => this.#sends(tx, invoiceId));
	}

	/**
	 * Logs one mail and puts it in the outbox, in the caller's transaction: the log, the link and the mail exist
	 * together or not at all. The send log then shows the outbox's delivery state.
	 */
	async deliver(tx: Tx, scope: MemberScope, delivery: Delivery, caller: Caller): Promise<InvoiceSend> {
		const context = await invoiceMailContext(tx, scope, delivery.invoiceId, await defaultSender(tx, 'business'));
		if (delivery.method === 'link' && !context.postcode) throw new ApiError(400, 'error.ws.invoice_link_no_postcode');
		const now = this.#services.now();
		const id = uuid();
		const expiresAt = delivery.method === 'link' ? new Date(now.getTime() + lifetimes.invoice_link) : null;
		await tx
			.insertInto('invoiceSends')
			.values({
				id,
				tenantId: scope.tenantId,
				invoiceId: delivery.invoiceId,
				kind: delivery.kind,
				level: delivery.level,
				documentId: delivery.documentId,
				recipient: delivery.to,
				method: delivery.method,
				sentAt: now,
				sentBy: scope.userId,
				linkExpiresAt: expiresAt,
			})
			.execute();
		const link = expiresAt ? { url: await this.#linkUrl(tx, scope.tenantId, id, now), expiresAt } : null;
		const { id: outboxId } = await enqueueMail(tx, scope.tenantId, invoiceMail(context, delivery, link));
		await tx.updateTable('invoiceSends').set({ outboxId }).where('id', '=', id).execute();
		await audit(
			tx,
			{
				action: delivery.kind === 'invoice' ? 'invoice.sent' : 'invoice.reminder_sent',
				actorId: scope.userId,
				tenantId: scope.tenantId,
				target: delivery.invoiceId,
				meta: { method: delivery.method, level: delivery.level },
			},
			caller,
		);
		const [send] = (await this.#sends(tx, delivery.invoiceId)).filter((row) => row.id === id);
		return send;
	}

	/** A secure link to the send's file; only its hash is stored. */
	async #linkUrl(tx: Tx, tenantId: string, invoiceSendId: string, now: Date) {
		const { token } = await issueLink(tx, { purpose: 'invoice_link', tenantId, invoiceSendId, now });
		return webLink(this.#services.config.WEB_ORIGIN, publicRoutes.invoice(token));
	}

	async #sends(tx: Tx, invoiceId: string): Promise<InvoiceSend[]> {
		const rows = await tx
			.selectFrom('invoiceSends')
			.leftJoin('users', 'users.id', 'invoiceSends.sentBy')
			.leftJoin('mailOutbox', 'mailOutbox.id', 'invoiceSends.outboxId')
			.selectAll('invoiceSends')
			.select(['users.firstName', 'users.lastName', 'users.email', 'mailOutbox.status as delivery'])
			.where('invoiceSends.invoiceId', '=', invoiceId)
			.orderBy('invoiceSends.sentAt', 'desc')
			.execute();
		return rows.map((row) => ({
			id: row.id,
			tenantId: row.tenantId,
			invoiceId: row.invoiceId,
			kind: row.kind,
			level: row.level,
			documentId: row.documentId,
			recipient: row.recipient,
			method: row.method,
			sentAt: row.sentAt.toISOString(),
			sentBy: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || (row.email ?? ''),
			linkExpiresAt: row.linkExpiresAt?.toISOString() ?? null,
			openedAt: row.openedAt?.toISOString() ?? null,
			openCount: row.openCount,
			// Sent before the outbox existed: delivered directly.
			delivery: row.delivery ?? 'sent',
		})) as InvoiceSend[];
	}
}

/** Today in the workspace's time zone, as YYYY-MM-DD. */
function localDate(now: Date, timeZone: string) {
	return now.toLocaleDateString('sv-SE', { timeZone: timeZone || 'Europe/Zurich' });
}
