import { expectedRecords, type DomainPurpose, type RecordCheck } from '@clinks/domain/mail-domains';
import { z } from 'zod';

const uuid = z.uuid();
const email = z.email().max(254);

export const mailDomainInput = z.strictObject({
	domain: z.string().trim().min(3).max(253),
	purpose: z.enum(['business', 'newsletter']),
});

export const mailDomainDto = z.object({
	id: uuid,
	domain: z.string(),
	purpose: z.enum(['business', 'newsletter']),
	status: z.enum(['pending', 'verified', 'failing']),
	checkedAt: z.string().nullable(),
	/** The records to publish, each with the result of the last check. */
	records: z.array(
		z.object({
			record: z.enum(['spf', 'dkim', 'dmarc']),
			type: z.literal('TXT'),
			host: z.string(),
			value: z.string(),
			ok: z.boolean().nullable(),
			found: z.string().nullable(),
		}),
	),
});
export type MailDomainView = z.infer<typeof mailDomainDto>;

export const mailSenderInput = z.strictObject({
	kind: z.enum(['business', 'personal', 'newsletter']),
	address: email,
	displayName: z.string().trim().min(1).max(120),
	replyTo: email.nullable(),
	/** The member a personal sender belongs to. */
	userId: uuid.nullable(),
	signature: z.string().max(1000),
	isDefault: z.boolean(),
});
export type MailSenderInput = z.infer<typeof mailSenderInput>;

export const mailSenderDto = mailSenderInput.extend({
	id: uuid,
	domainId: uuid,
	/** Whether mail goes out from this address now; else from the platform address with this display name. */
	active: z.boolean(),
});
export type MailSenderView = z.infer<typeof mailSenderDto>;

export const mailSettingsDto = z.object({
	domains: z.array(mailDomainDto),
	senders: z.array(mailSenderDto),
	/** Whether this installation has a relay for own domains at all. */
	relay: z.boolean(),
	/** BCC or forward mail here to file it at the contact; null when inbound mail is not set up. */
	filingAddress: z.string().nullable(),
});
export type MailSettingsView = z.infer<typeof mailSettingsDto>;

/** A sender domain as stored: what the API and the demo keep. */
export interface StoredMailDomain {
	id: string;
	domain: string;
	purpose: DomainPurpose;
	selector: string;
	dkimPublicKey: string;
	status: 'pending' | 'verified' | 'failing';
	checks: RecordCheck[];
	checkedAt: string | Date | null;
}

/** The records to publish for a stored domain, each with the result of its last check. */
export function mailDomainView(domain: StoredMailDomain, spfInclude: string): MailDomainView {
	const expected = expectedRecords(
		domain.domain,
		{ selector: domain.selector, publicKey: domain.dkimPublicKey },
		spfInclude,
	);
	const checkedAt = domain.checkedAt === null ? null : new Date(domain.checkedAt).toISOString();
	return {
		id: domain.id,
		domain: domain.domain,
		purpose: domain.purpose,
		status: domain.status,
		checkedAt,
		records: expected.map((record) => {
			const check = domain.checks.find((candidate) => candidate.record === record.record);
			return { ...record, ok: check?.ok ?? null, found: check?.found ?? null };
		}),
	};
}

/** «Senden» in the mail module: one mail per recipient, placeholders filled for each. */
export const mailSendInput = z.strictObject({
	/** A sender the caller may use; null: their personal sender, else the platform address in their name. */
	senderId: uuid.nullable(),
	to: z.array(email).min(1).max(20),
	subject: z.string().trim().min(1).max(300),
	body: z.string().max(50_000),
	/** Documents to attach. */
	attachmentIds: z.array(uuid).max(5),
	/** The mail answered: its Message-ID threads the reply. */
	replyToId: uuid.nullable(),
	/** The draft this was; it is removed once sent. */
	draftId: uuid.nullable(),
});
export type MailSendInput = z.infer<typeof mailSendInput>;

export const mailSendResult = z.object({
	queued: z.number().int(),
	/** Recipients that got nothing: the address bounced before. */
	suppressed: z.array(z.string()),
	/** The queued mails, to take them back with `/mail/send/cancel` until `undoUntil`. */
	outboxIds: z.array(uuid),
	/** Until when the mails wait before they go out; null: they go out right away. */
	undoUntil: z.string().nullable(),
});
export type MailSendResult = z.infer<typeof mailSendResult>;

/** «Undo send»: takes back mails that still wait in the queue. */
export const mailSendCancelInput = z.strictObject({ outboxIds: z.array(uuid).min(1).max(20) });
export type MailSendCancelInput = z.infer<typeof mailSendCancelInput>;

/** A sender the caller may pick in the compose form. */
export const ownSenderDto = z.object({
	id: uuid,
	kind: z.enum(['business', 'personal']),
	address: z.string(),
	displayName: z.string(),
	active: z.boolean(),
});
export type OwnSenderView = z.infer<typeof ownSenderDto>;

/** Settings › E-Mail › Termine (`@clinks/domain/appointment-mail`). */
export const appointmentMailSettings = z.strictObject({
	confirmation: z.boolean(),
	reminder: z.boolean(),
	hoursBefore: z.number().int().min(1).max(168),
	text: z.string().trim().max(500),
	spitexVisits: z.boolean(),
});
