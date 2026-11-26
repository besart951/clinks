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

/** A camt.053 or camt.054 file as text; e-banking exports are XML in UTF-8. */
export const bankImportInput = z.strictObject({
	fileName: z.string().trim().min(1).max(200),
	content: z
		.string()
		.min(1)
		.max(5 * 1024 * 1024),
});
export type BankImportInput = z.infer<typeof bankImportInput>;

export const bankImportDto = z.object({
	id: uuid,
	fileName: z.string(),
	kind: z.enum(['camt.053', 'camt.054']),
	importedAt: z.string(),
	importedBy: z.string(),
	credits: z.number().int(),
	booked: z.number().int(),
	duplicates: z.number().int(),
	/** True when this very file had been imported before; nothing was booked again. */
	repeated: z.boolean(),
});
export type BankImportView = z.infer<typeof bankImportDto>;

export const bankEntryDto = z.object({
	id: uuid,
	importId: uuid,
	date: z.string(),
	amount: z.number().int(),
	currency: z.string(),
	reference: z.string(),
	debtor: z.string(),
	info: z.string(),
	status: z.enum(['booked', 'open', 'ignored']),
	invoiceId: uuid.nullable(),
	suggestions: z.array(
		z.object({ invoiceId: uuid, number: z.string(), recipient: z.string(), balance: z.number().int() }),
	),
});
export type BankEntryView = z.infer<typeof bankEntryDto>;

export const bankEntryAssign = z.strictObject({ invoiceId: uuid });
