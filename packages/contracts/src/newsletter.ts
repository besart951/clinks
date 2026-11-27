import { z } from 'zod';

const uuid = z.uuid();
const email = z.email().max(254);
const tag = z.string().trim().min(1).max(60);

/** A sign-up form as kept in Settings › E-Mail. */
export const newsletterFormInput = z.strictObject({
	title: z.string().trim().min(1).max(120),
	intro: z.string().trim().max(1_000),
	/** Given to the contact on confirmation; campaigns pick their audience by tag. */
	tags: z.array(tag).max(10),
	/** What the person agrees to; stored with each consent as proof. */
	consentText: z.string().trim().min(20).max(1_000),
	active: z.boolean(),
});
export type NewsletterFormInput = z.infer<typeof newsletterFormInput>;

export const newsletterFormDto = newsletterFormInput.extend({ id: uuid, token: z.string() });
export type NewsletterFormView = z.infer<typeof newsletterFormDto>;

/** What the public sign-up page shows. */
export const publicFormDto = z.object({
	tenantName: z.string(),
	title: z.string(),
	intro: z.string(),
	consentText: z.string(),
});
export type PublicFormView = z.infer<typeof publicFormDto>;

export const signUpInput = z.strictObject({
	firstName: z.string().trim().max(100),
	lastName: z.string().trim().max(100),
	email,
	consent: z.literal(true, { error: 'error.ws.newsletter_consent_required' }),
	/** Hidden field: people leave it empty, bots fill it in. */
	website: z.string().max(200),
});
export type SignUpInput = z.infer<typeof signUpInput>;

export const confirmedDto = z.object({ tenantName: z.string() });
export type ConfirmedView = z.infer<typeof confirmedDto>;

/** One entry of a contact's consent history. */
export const consentDto = z.object({
	id: uuid,
	status: z.enum(['subscribed', 'unsubscribed']),
	source: z.enum(['form', 'manual', 'import', 'unsubscribe_link', 'bounce']),
	consentText: z.string(),
	note: z.string(),
	actorName: z.string().nullable(),
	createdAt: z.string(),
});
export type ConsentView = z.infer<typeof consentDto>;

/** «Einwilligung erfassen» or «Abmelden» by hand: a note says how it was given (e.g. «Anmeldebogen am Empfang»). */
export const consentInput = z.strictObject({
	status: z.enum(['subscribed', 'unsubscribed']),
	note: z.string().trim().min(3).max(500),
});
export type ConsentInput = z.infer<typeof consentInput>;

/** Consents gathered elsewhere (a previous tool, paper forms), by e-mail address of existing contacts. */
export const consentImportInput = z.strictObject({
	emails: z.array(email).min(1).max(5_000),
	note: z.string().trim().min(3).max(500),
});
export const consentImportResult = z.object({ subscribed: z.number().int(), unknown: z.array(z.string()) });
export type ConsentImportResult = z.infer<typeof consentImportResult>;

/** Who a campaign reaches now: the tag's subscribed contacts minus suppressed addresses. */
export const audienceDto = z.object({ count: z.number().int(), suppressed: z.number().int() });
export type AudienceView = z.infer<typeof audienceDto>;

/** «Planen» at a time, or null for «Jetzt senden». */
export const scheduleInput = z.strictObject({ at: z.iso.datetime({ offset: true }).nullable() });

export const unsubscribeDto = z.object({ tenantName: z.string(), done: z.boolean() });
export type UnsubscribeView = z.infer<typeof unsubscribeDto>;

export const unsubscribeReason = z.strictObject({ reason: z.string().trim().max(500) });
