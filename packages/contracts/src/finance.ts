import { z } from 'zod';

const uuid = z.uuid();

/** «Senden»: to whom and how; the server renders nothing new, it sends the archived PDF. */
export const invoiceSendInput = z.strictObject({
	to: z.email().max(254),
	method: z.enum(['attachment', 'link']),
});
export type InvoiceSendInput = z.infer<typeof invoiceSendInput>;

export const invoiceSendDto = z.object({
	id: uuid,
	tenantId: uuid,
	invoiceId: uuid,
	kind: z.enum(['invoice', 'reminder']),
	level: z.number().int().nullable(),
	documentId: uuid,
	recipient: z.string(),
	method: z.enum(['attachment', 'link']),
	sentAt: z.string(),
	sentBy: z.string(),
	linkExpiresAt: z.string().nullable(),
	openedAt: z.string().nullable(),
	openCount: z.number().int(),
});

/** What a secure link shows before the postcode: who sent what, and until when it works. */
export const invoiceLinkDetails = z.object({
	tenantName: z.string(),
	number: z.string(),
	kind: z.enum(['invoice', 'reminder']),
	level: z.number().int().nullable(),
	expiresAt: z.string(),
});
export type InvoiceLinkDetails = z.infer<typeof invoiceLinkDetails>;

export const invoiceLinkOpen = z.strictObject({ postcode: z.string().trim().min(1).max(12) });

export const invoiceLinkFile = z.object({ name: z.string(), url: z.string() });
export type InvoiceLinkFile = z.infer<typeof invoiceLinkFile>;
