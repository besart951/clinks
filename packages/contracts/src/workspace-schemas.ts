import { z } from 'zod';
import {
	campaignStatuses,
	expenseCategories,
	invoiceStatuses,
	mailFolders,
	physioTariffs,
	taskStatuses,
} from '@clinks/domain/types';
import {
	appointmentSchema,
	campaignSchema,
	commentSchema,
	contactSchema,
	expenseSchema,
	folderSchema,
	invoiceSchema,
	mailSchema,
	noteSchema,
	prescriptionSchema,
	taskSchema,
	templateSchema,
} from './schemas.ts';

const id = z.uuid();
const ids = z.array(id);
const text = z.string();
const count = z.int().nonnegative();
const date = z.iso.date();
const timestamp = z.iso.datetime({ offset: true });
const attachment = z.object({ kind: z.enum(['contact', 'task', 'invoice', 'expense']), id });
export const maxDocumentBytes = 1_000_000;

function comment(kind: 'contact' | 'invoice' | 'task') {
	return commentSchema.extend({ target: z.object({ kind: z.literal(kind), id }), authorId: id, mentions: ids });
}

function note(kind: 'physio' | 'spitex') {
	return noteSchema.extend({
		kind: z.literal(kind),
		contactId: id,
		appointmentId: id.nullable(),
		date,
		authorId: id,
		subjective: text,
		objective: text,
		assessment: text,
		plan: text,
	});
}

/** Full records persisted by the workspace repositories, including fields outside the edit forms. */
export const workspaceSchemas = {
	contacts: contactSchema,
	appointments: appointmentSchema,
	folders: folderSchema.extend({ parentId: id.nullable() }),
	documents: z.object({
		name: text.min(1),
		folderId: id.nullable(),
		mimeType: text,
		size: count.max(maxDocumentBytes),
		dataUrl: z.union([
			text.startsWith('data:').max(4 * Math.ceil(maxDocumentBytes / 3) + 256),
			text.regex(/^version:[0-9a-f-]{36}$/u),
		]),
		targets: z.array(attachment),
		uploadedBy: id,
	}),
	invoices: invoiceSchema.extend({
		number: text,
		kind: z.enum(['invoice', 'credit_note']),
		contactId: id,
		issueDate: date,
		dueDate: date,
		status: z.enum(invoiceStatuses),
		payments: z.array(z.object({ date, amount: z.int().positive() })),
		// Set by the server when it sends a reminder; clients do not send them (sync ignores them on upload).
		reminderLevel: count.optional(),
		reminders: z
			.array(z.object({ level: count, date, dueDate: date, fee: count, documentId: id.nullable() }))
			.optional(),
		notes: text,
		appointmentIds: ids,
	}),
	expenses: expenseSchema.extend({
		date,
		supplier: text,
		category: z.enum(expenseCategories),
		receiptId: id.nullable(),
		status: z.enum(['open', 'booked']),
	}),
	tasks: taskSchema.extend({
		description: text,
		status: z.enum(taskStatuses),
		priority: z.enum(['low', 'medium', 'high', 'urgent']),
		assigneeIds: ids,
		dueDate: date.nullable(),
		labels: z.array(text),
		order: z.int(),
		contactId: id.nullable(),
		checklist: z.array(z.object({ text, done: z.boolean() })),
	}),
	contact_comments: comment('contact'),
	task_comments: comment('task'),
	invoice_comments: comment('invoice'),
	mails: mailSchema.safeExtend({
		folder: z.enum(mailFolders),
		from: text,
		fromName: text,
		body: text,
		sentAt: timestamp,
		read: z.boolean(),
		starred: z.boolean(),
		contactId: id.nullable(),
	}),
	templates: templateSchema.extend({ body: text }),
	campaigns: campaignSchema.extend({
		subject: text,
		previewText: text,
		body: text,
		audienceTag: text,
		status: z.enum(campaignStatuses),
		scheduledAt: timestamp.nullable(),
		sentAt: timestamp.nullable(),
		approvedBy: id.nullable(),
		stats: z.object({ recipients: count, opens: count, clicks: count, unsubscribes: count }),
	}),
	prescriptions: prescriptionSchema.extend({
		contactId: id,
		tariff: z.enum(physioTariffs),
		issuedOn: date,
		validUntil: date,
	}),
	physio_notes: note('physio'),
	spitex_notes: note('spitex'),
	time_entries: z.object({
		userId: id,
		appointmentId: id.nullable(),
		date,
		minutes: z.int().positive(),
		description: text,
	}),
	spitex_week_releases: z.object({
		weekStart: date.refine((value) => new Date(`${value}T00:00:00Z`).getUTCDay() === 1, { error: 'error.validation' }),
		releasedBy: id,
	}),
	notifications: z.object({
		userId: id,
		kind: z.enum(['mention', 'assignment', 'invoice', 'appointment', 'plan', 'system']),
		message: z.object({ key: text.startsWith('ui.ws.notification.'), params: z.record(text, text) }),
		href: text.regex(/^\/(?![/\\])/),
		read: z.boolean(),
	}),
};
