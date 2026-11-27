import type { Tx } from '@clinks/db/scope';
import type { DeliveryMethod, InvoiceSettings } from '@clinks/domain/invoicing';
import type { ProductTranslationKey } from '@clinks/i18n-types';
import { blocksFromText } from '@clinks/mail-layout/layout';
import { ApiError } from '../errors.ts';
import { translate } from '../i18n.ts';
import type { QueuedMail } from './outbox.ts';

type Locale = 'de-CH' | 'en-US';

/** One mail for an invoice: the invoice itself, or a reminder with its own archived PDF. */
export interface Delivery {
	invoiceId: string;
	kind: 'invoice' | 'reminder';
	level: number | null;
	documentId: string;
	/** SHA-256 of the archived file; the worker refuses to attach a file that no longer matches. */
	sha256: string | null;
	to: string;
	method: DeliveryMethod;
}

/** What the mails about one invoice need: names, dates, the recipient's postcode and the file names. */
export async function invoiceMailContext(tx: Tx, scope: { tenantId: string; userId: string }, invoiceId: string) {
	const invoice = await tx
		.selectFrom('invoices')
		.leftJoin('contacts', 'contacts.id', 'invoices.contactId')
		.select(['invoices.number', 'invoices.dueDate', 'invoices.contactId', 'contacts.address'])
		.where('invoices.id', '=', invoiceId)
		.executeTakeFirst();
	if (!invoice) throw new ApiError(404, 'error.ws.not_found');
	const tenant = await tx
		.selectFrom('tenants')
		.select(['name', 'locale', 'invoiceSettings'])
		.where('id', '=', scope.tenantId)
		.executeTakeFirstOrThrow();
	const sender = await tx.selectFrom('users').select('email').where('id', '=', scope.userId).executeTakeFirst();
	const documents = await tx
		.selectFrom('documents')
		.select(['id', 'name'])
		.where('targets', '@>', JSON.stringify([{ kind: 'invoice', id: invoiceId }]))
		.execute();
	const files = new Map(documents.map((doc) => [String(doc.id), String(doc.name)]));
	const number = String(invoice.number);
	return {
		locale: (tenant.locale === 'en-US' ? 'en-US' : 'de-CH') as Locale,
		tenantName: tenant.name,
		number,
		dueDate: String(invoice.dueDate),
		contactId: invoice.contactId ? String(invoice.contactId) : null,
		postcode: (invoice.address as { zip?: string } | null)?.zip?.trim() ?? '',
		replyTo: (tenant.invoiceSettings as InvoiceSettings).replyTo || sender?.email || undefined,
		fileName: (documentId: string) => files.get(documentId) ?? `${number}.pdf`,
	};
}

export type InvoiceMailContext = Awaited<ReturnType<typeof invoiceMailContext>>;

/**
 * The mail for an invoice or reminder. With a secure link it names no amount and no service, only who sent it and
 * the invoice number; with an attachment it carries the archived PDF.
 */
export function invoiceMail(
	context: InvoiceMailContext,
	delivery: Delivery,
	link: { url: string; expiresAt: Date } | null,
): Omit<QueuedMail, 'fromName'> {
	const t = (key: ProductTranslationKey, params?: { [name: string]: string | number }) =>
		translate(context.locale, key, params);
	const params = {
		tenant: context.tenantName,
		number: context.number,
		level: delivery.level ?? 0,
		due: formatDate(context.dueDate, context.locale),
	};
	const invoice = delivery.kind === 'invoice';
	const text = link
		? t('mail.invoice.body_link', {
				...params,
				link: link.url,
				expires: formatDate(link.expiresAt.toISOString().slice(0, 10), context.locale),
			})
		: t(invoice ? 'mail.invoice.body_attachment' : 'mail.invoice.reminder_body', params);
	return {
		kind: invoice ? 'invoice' : 'reminder',
		to: delivery.to,
		subject: t(invoice ? 'mail.invoice.subject' : 'mail.invoice.reminder_subject', params),
		content: { blocks: blocksFromText(text, link ? t('mail.invoice.open_link') : undefined) },
		replyTo: context.replyTo,
		contactId: context.contactId,
		attachments: link
			? []
			: [
					{
						documentId: delivery.documentId,
						filename: context.fileName(delivery.documentId),
						contentType: 'application/pdf',
						sha256: delivery.sha256 ?? undefined,
					},
				],
	};
}

/** A calendar date as the recipient reads it: 31.12.2026 or 12/31/2026. */
function formatDate(date: string, locale: Locale) {
	const [year, month, day] = date.split('-');
	return locale === 'en-US' ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;
}
