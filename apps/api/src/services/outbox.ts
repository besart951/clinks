import type { MailKind, OutboxAttachment } from '@clinks/db/schema';
import type { MailDelivery } from '@clinks/domain/types';
import type { Tx } from '@clinks/db/scope';
import { renderMail, type MailContent, type MailExtras } from '@clinks/mail-layout/layout';
import { refreshCampaignStats } from './campaign-stats.ts';
import { base32Uuid, uuid, uuidFromBase32, uuidToBase32 } from '../crypto.ts';
import type { Sender } from './mail-senders.ts';

/** One mail a workspace sends; the outbox renders it in the workspace's layout and the worker sends it. */
export interface QueuedMail {
	kind: MailKind;
	to: string;
	subject: string;
	content: MailContent;
	/** The workspace address it goes out from; without one the platform address with the workspace's name. */
	sender?: Sender | null;
	/** Display name; the sender's, else the workspace's name. */
	fromName?: string;
	/** Where replies go; the sender's reply-to or address when not given. */
	replyTo?: string;
	attachments?: OutboxAttachment[];
	headers?: Record<string, string>;
	contactId?: string | null;
	/** The campaign this newsletter mail belongs to; its numbers follow the delivery. */
	campaignId?: string;
	/** Keep a copy under Mail › Gesendet: by default for mail to a contact, never for newsletters. */
	file?: boolean;
	extras?: MailExtras;
}

/** The queued mail; `suppressed` when the address bounced before and nothing will be sent. */
export interface Enqueued {
	id: string;
	suppressed: boolean;
}

/**
 * Writes the mail to the outbox in the caller's transaction, so it goes out exactly when the change that causes it
 * is saved. Mail to a contact is also filed under Mail › Gesendet at that contact, with its delivery. An address the
 * workspace may not write to any more (bounced; unsubscribed, for newsletters) gets nothing: the row says
 * `suppressed`.
 */
export async function enqueueMail(tx: Tx, tenantId: string, mail: QueuedMail): Promise<Enqueued> {
	const tenant = await tx
		.selectFrom('tenants')
		.select(['name', 'brandColor', 'address', 'locale'])
		.where('id', '=', tenantId)
		.executeTakeFirstOrThrow();
	const sender = mail.sender ?? null;
	const rendered = renderMail(
		{ ...mail.content, signature: mail.content.signature ?? (sender?.signature || undefined) },
		{ name: tenant.name, color: tenant.brandColor, footer: addressLines(tenant.address) },
		{ locale: tenant.locale, ...mail.extras },
	);
	const id = uuid();
	const suppressed = await isSuppressed(tx, mail.to, mail.kind);
	const fromName = mail.fromName ?? sender?.displayName ?? tenant.name;
	const replyTo = mail.replyTo ?? sender?.replyTo ?? sender?.address ?? null;
	await tx
		.insertInto('mailOutbox')
		.values({
			id,
			tenantId,
			kind: mail.kind,
			senderId: sender?.id ?? null,
			fromName,
			replyTo,
			recipient: mail.to,
			subject: mail.subject,
			textBody: rendered.text,
			htmlBody: rendered.html,
			attachments: JSON.stringify(mail.attachments ?? []) as never,
			headers: JSON.stringify(mail.headers ?? {}) as never,
			contactId: mail.contactId ?? null,
			campaignId: mail.campaignId ?? null,
			messageId: outboxMessageId(id),
			status: suppressed ? 'suppressed' : 'queued',
		})
		.execute();
	if (!suppressed) await tx.insertInto('auth.mailQueue').values({ outboxId: id, tenantId }).execute();
	if (mail.file ?? (!!mail.contactId && mail.kind !== 'campaign')) {
		const now = new Date();
		await tx
			.insertInto('mails')
			.values({
				id: uuid(),
				tenantId,
				folder: 'sent',
				sender: sender?.address ?? replyTo ?? '',
				fromName,
				recipients: JSON.stringify([mail.to]),
				subject: mail.subject,
				body: rendered.text,
				sentAt: now,
				isRead: true,
				starred: false,
				contactId: mail.contactId ?? null,
				messageId: outboxMessageId(id),
				delivery: suppressed ? 'suppressed' : 'queued',
				createdAt: now,
				updatedAt: now,
			})
			.execute();
	}
	return { id, suppressed };
}

/** The Message-ID of an outbox mail; bounces and replies point back to it. */
export function outboxMessageId(outboxId: string) {
	return `<${outboxId}@clinks.ch>`;
}

/** Bounced addresses get no mail at all; unsubscribed ones no newsletters. */
async function isSuppressed(tx: Tx, address: string, kind: MailKind) {
	const scopes = kind === 'campaign' ? (['all', 'newsletter'] as const) : (['all'] as const);
	const row = await tx
		.selectFrom('mailSuppressions')
		.select('address')
		.where('address', '=', address.toLowerCase())
		.where('scope', 'in', scopes)
		.executeTakeFirst();
	return !!row;
}

function addressLines(address: { street: string; houseNumber: string; zip: string; city: string }) {
	return [`${address.street} ${address.houseNumber}`.trim(), `${address.zip} ${address.city}`.trim()].filter(Boolean);
}

export function dequeue(tx: Tx, outboxId: string) {
	return tx.deleteFrom('auth.mailQueue').where('outboxId', '=', outboxId).execute();
}

/**
 * Where a mail ended up: on the outbox row, on the filed copy at the contact (which syncs to the apps), and out of
 * the queue. Bounces arrive later through the inbound mailbox and settle again.
 */
export async function settle(tx: Tx, outboxId: string, status: MailDelivery, now: Date) {
	const row = await tx
		.updateTable('mailOutbox')
		.set({ status })
		.where('id', '=', outboxId)
		.returning('campaignId')
		.executeTakeFirst();
	if (row?.campaignId) await refreshCampaignStats(tx, row.campaignId, now);
	await tx
		.updateTable('mails')
		.set((eb) => ({ delivery: status, revision: eb('revision', '+', 1), updatedAt: now }))
		.where('messageId', '=', outboxMessageId(outboxId))
		.execute();
	await dequeue(tx, outboxId);
}

/**
 * The Return-Path of one outbox mail: `b-<outbox>-<workspace>` in base32, so a bounce names both without a lookup
 * across workspaces and survives servers that lower-case addresses.
 */
export function bounceAddress(outboxId: string, tenantId: string, domain: string) {
	return `b-${uuidToBase32(outboxId)}-${uuidToBase32(tenantId)}@${domain}`;
}

export function readBounceAddress(local: string) {
	const match = new RegExp(`^b-(${base32Uuid})-(${base32Uuid})$`).exec(local.toLowerCase());
	return match ? { outboxId: uuidFromBase32(match[1]), tenantId: uuidFromBase32(match[2]) } : null;
}
