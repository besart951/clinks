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
