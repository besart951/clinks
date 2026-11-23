import { z } from 'zod';
import { vatRates } from '@clinks/domain/types';
import { parseR2Endpoint, storageProviders } from '@clinks/domain/storage';

const required = z.string().trim().min(1, { error: 'error.ws.required' });
const optionalEmail = z.union([z.literal(''), z.email({ error: 'error.ws.invalid_email' })]);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'error.ws.invalid_date' });
const vatRate = z.union(vatRates.map((rate) => z.literal(rate)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]);

/** Shared by the mock server and the forms, so the real API can adopt the same rules. */
export const contactSchema = z
	.object({
		kind: z.enum(['person', 'company']),
		firstName: z.string(),
		lastName: z.string(),
		companyName: z.string(),
		email: optionalEmail,
		phone: z.string().regex(/^[+\d\s()/-]*$/, { error: 'error.ws.invalid_phone' }),
		address: z.object({
			street: z.string(),
			zip: z.string().regex(/^(\d{4,5})?$/, { error: 'error.ws.invalid_zip' }),
			city: z.string(),
		}),
	})
	.loose()
	.superRefine((value, context) => {
		if (value.kind === 'person' && !value.lastName.trim()) {
			context.addIssue({ code: 'custom', path: ['lastName'], message: 'error.ws.required' });
		}
		if (value.kind === 'company' && !value.companyName.trim()) {
			context.addIssue({ code: 'custom', path: ['companyName'], message: 'error.ws.required' });
		}
	});

export const appointmentSchema = z
	.object({ title: required, start: z.iso.datetime(), end: z.iso.datetime() })
	.loose()
	.refine((value) => new Date(value.end) > new Date(value.start), {
		path: ['end'],
		message: 'error.ws.end_before_start',
	});

export const invoiceSchema = z
	.object({
		contactId: required,
		issueDate: calendarDate,
		dueDate: calendarDate,
		lines: z
			.array(
				z.object({
					description: required,
					quantity: z.number().positive({ error: 'error.ws.positive_number' }),
					unitPrice: z.number().int().nonnegative({ error: 'error.ws.positive_number' }),
					vatRate,
				}),
			)
			.min(1, { error: 'error.ws.invoice_lines_required' }),
	})
	.loose();

export const expenseSchema = z
	.object({
		date: calendarDate,
		description: required,
		amount: z.number().int().positive({ error: 'error.ws.positive_number' }),
		vatRate,
	})
	.loose();

export const taskSchema = z.object({ title: required }).loose();
export const templateSchema = z.object({ name: required, subject: required }).loose();
export const folderSchema = z.object({ name: required }).loose();
export const roleSchema = z.object({ name: required }).loose();

export const mailSchema = z
	.object({ to: z.array(z.email({ error: 'error.ws.invalid_email' })), subject: z.string() })
	.loose()
	.superRefine((value, context) => {
		const draft = (value as { folder?: string }).folder === 'drafts';
		if (!draft && value.to.length === 0)
			context.addIssue({ code: 'custom', path: ['to'], message: 'error.ws.recipient_required' });
		if (!draft && !value.subject.trim())
			context.addIssue({ code: 'custom', path: ['subject'], message: 'error.ws.required' });
	});

export const campaignSchema = z.object({ name: required }).loose();

export const prescriptionSchema = z
	.object({
		doctor: required,
		diagnosis: required,
		sessionsPrescribed: z
			.number()
			.int()
			.min(1, { error: 'error.ws.positive_number' })
			.max(36, { error: 'error.ws.too_many_sessions' }),
		issuedOn: calendarDate,
		validUntil: calendarDate,
	})
	.loose();

export const noteSchema = z.object({ date: calendarDate }).loose();

export const invitationSchema = z.object({ email: z.email({ error: 'error.ws.invalid_email' }) }).loose();

export const commentSchema = z.object({ body: required }).loose();

const bucketName = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/**
 * The tenant's own S3 bucket. CLinks storage needs no fields; every other provider needs a bucket, an HTTPS
 * endpoint, a region and an access key. An empty secret keeps the stored one (`requireSecret` is false then).
 */
export function storageSettingsSchema(options: { requireSecret: boolean; requireAcknowledgement: boolean }) {
	return z
		.object({
			provider: z.enum(storageProviders),
			endpoint: z.string().trim(),
			region: z.string().trim(),
			bucket: z.string().trim(),
			accessKeyId: z.string().trim(),
			secretAccessKey: z.string(),
			pathStyle: z.boolean(),
			acknowledgeLocation: z.boolean(),
		})
		.superRefine((value, context) => {
			if (value.provider === 'clinks') return;
			const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
			if (value.provider === 'cloudflare' && !parseR2Endpoint(value.endpoint))
				issue('endpoint', 'error.ws.storage_cloudflare_account');
			else if (!/^https:\/\/[^\s/]+(\/\S*)?$/.test(value.endpoint)) issue('endpoint', 'error.ws.storage_endpoint');
			if (!value.region) issue('region', 'error.ws.required');
			if (!bucketName.test(value.bucket)) issue('bucket', 'error.ws.storage_bucket');
			if (!value.accessKeyId) issue('accessKeyId', 'error.ws.required');
			if (options.requireSecret && !value.secretAccessKey) issue('secretAccessKey', 'error.ws.required');
			if (options.requireAcknowledgement && !value.acknowledgeLocation)
				issue('acknowledgeLocation', 'error.ws.storage_location_consent');
		});
}
