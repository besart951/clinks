import type { MailKind, OutboxAttachment } from '@clinks/db/schema';
import type { Tx } from '@clinks/db/scope';
import { renderMail, type MailContent, type MailExtras } from '@clinks/mail-layout/layout';
import { uuid } from '../crypto.ts';

/** One mail a workspace sends; the outbox renders it in the workspace's layout and the worker sends it. */
export interface QueuedMail {
	kind: MailKind;
	to: string;
	subject: string;
	content: MailContent;
	/** Display name; the workspace's name when not given. */
	fromName?: string;
	replyTo?: string;
	attachments?: OutboxAttachment[];
	headers?: Record<string, string>;
	contactId?: string | null;
	extras?: MailExtras;
}

/**
 * Writes the mail to the outbox in the caller's transaction, so it goes out exactly when the change that causes it
 * is saved. Returns the outbox id.
 */
export async function enqueueMail(tx: Tx, tenantId: string, mail: QueuedMail): Promise<string> {
	const tenant = await tx
		.selectFrom('tenants')
		.select(['name', 'brandColor', 'address', 'locale'])
		.where('id', '=', tenantId)
		.executeTakeFirstOrThrow();
	const address = tenant.address;
	const footer = [`${address.street} ${address.houseNumber}`.trim(), `${address.zip} ${address.city}`.trim()].filter(
		Boolean,
	);
	const rendered = renderMail(
		mail.content,
		{ name: tenant.name, color: tenant.brandColor, footer },
		{ locale: tenant.locale, ...mail.extras },
	);
	const id = uuid();
	await tx
		.insertInto('mailOutbox')
		.values({
			id,
			tenantId,
			kind: mail.kind,
			fromName: mail.fromName ?? tenant.name,
			replyTo: mail.replyTo ?? null,
			recipient: mail.to,
			subject: mail.subject,
			textBody: rendered.text,
			htmlBody: rendered.html,
			attachments: JSON.stringify(mail.attachments ?? []) as never,
			headers: JSON.stringify(mail.headers ?? {}) as never,
			contactId: mail.contactId ?? null,
		})
		.execute();
	await tx.insertInto('auth.mailQueue').values({ outboxId: id, tenantId }).execute();
	return id;
}
