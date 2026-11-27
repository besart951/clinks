// Generated from src/tables.ts by `pnpm --filter @clinks/sync-schema generate`. DO NOT EDIT.
import { column, Schema, Table } from '@powersync/common';

export const contacts = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		kind: column.text,
		first_name: column.text,
		last_name: column.text,
		company_name: column.text,
		email: column.text,
		phone: column.text,
		address: column.text,
		birth_date: column.text,
		insurer: column.text,
		tags: column.text,
		notes: column.text,
		archived: column.integer,
		ahv_number: column.text,
		insurance_number: column.text,
		language: column.text,
		billing_mode: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const appointments = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		title: column.text,
		kind: column.text,
		status: column.text,
		contact_id: column.text,
		assignee_id: column.text,
		starts_at: column.text,
		ends_at: column.text,
		location: column.text,
		notes: column.text,
		series_id: column.text,
		service: column.text,
		arrival_window: column.text,
		billed_invoice_id: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const folders = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		name: column.text,
		parent_id: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const documents = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		name: column.text,
		folder_id: column.text,
		mime_type: column.text,
		size: column.integer,
		data_url: column.text,
		targets: column.text,
		uploaded_by: column.text,
		locked: column.integer,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const invoices = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		number: column.text,
		kind: column.text,
		contact_id: column.text,
		issue_date: column.text,
		due_date: column.text,
		status: column.text,
		lines: column.text,
		payments: column.text,
		reminder_level: column.integer,
		reminders: column.text,
		notes: column.text,
		appointment_ids: column.text,
		service_from: column.text,
		service_to: column.text,
		document_id: column.text,
		pdf_sha256: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const expenses = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		date: column.text,
		description: column.text,
		supplier: column.text,
		category: column.text,
		amount: column.integer,
		vat_rate: column.integer,
		receipt_id: column.text,
		status: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const tasks = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		title: column.text,
		description: column.text,
		status: column.text,
		priority: column.text,
		assignee_ids: column.text,
		due_date: column.text,
		labels: column.text,
		sort_order: column.integer,
		contact_id: column.text,
		checklist: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const contact_comments = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		target: column.text,
		author_id: column.text,
		body: column.text,
		mentions: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const task_comments = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		target: column.text,
		author_id: column.text,
		body: column.text,
		mentions: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const invoice_comments = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		target: column.text,
		author_id: column.text,
		body: column.text,
		mentions: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const mails = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		folder: column.text,
		sender: column.text,
		from_name: column.text,
		recipients: column.text,
		subject: column.text,
		body: column.text,
		sent_at: column.text,
		is_read: column.integer,
		starred: column.integer,
		contact_id: column.text,
		message_id: column.text,
		delivery: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const templates = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		name: column.text,
		subject: column.text,
		body: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const campaigns = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		name: column.text,
		subject: column.text,
		preview_text: column.text,
		body: column.text,
		audience_tag: column.text,
		status: column.text,
		scheduled_at: column.text,
		sent_at: column.text,
		approved_by: column.text,
		stats: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const prescriptions = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		contact_id: column.text,
		doctor: column.text,
		diagnosis: column.text,
		tariff: column.text,
		sessions_prescribed: column.integer,
		issued_on: column.text,
		valid_until: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const physio_notes = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		kind: column.text,
		contact_id: column.text,
		appointment_id: column.text,
		date: column.text,
		author_id: column.text,
		subjective: column.text,
		objective: column.text,
		assessment: column.text,
		plan: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const spitex_notes = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		kind: column.text,
		contact_id: column.text,
		appointment_id: column.text,
		date: column.text,
		author_id: column.text,
		subjective: column.text,
		objective: column.text,
		assessment: column.text,
		plan: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const time_entries = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		user_id: column.text,
		appointment_id: column.text,
		date: column.text,
		minutes: column.integer,
		description: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const spitex_week_releases = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		week_start: column.text,
		released_by: column.text,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const notifications = new Table(
	{
		tenant_id: column.text,
		revision: column.integer,
		created_at: column.text,
		updated_at: column.text,
		user_id: column.text,
		kind: column.text,
		message: column.text,
		href: column.text,
		is_read: column.integer,
	},
	{ indexes: { tenant: ['tenant_id'] } },
);

export const audit = new Table({
	tenant_id: column.text,
	actor_id: column.text,
	action: column.text,
	target: column.text,
	created_at: column.text,
});

export const users = new Table({
	first_name: column.text,
	last_name: column.text,
	email: column.text,
	avatar_color: column.text,
});

export const memberships = new Table({
	tenant_id: column.text,
	user_id: column.text,
	job_title: column.text,
});

export const visit_clients = new Table({
	tenant_id: column.text,
	kind: column.text,
	first_name: column.text,
	last_name: column.text,
	company_name: column.text,
	phone: column.text,
	address: column.text,
});

export const powerSyncSchema = new Schema({ contacts, appointments, folders, documents, invoices, expenses, tasks, contact_comments, task_comments, invoice_comments, mails, templates, campaigns, prescriptions, physio_notes, spitex_notes, time_entries, spitex_week_releases, notifications, audit, users, memberships, visit_clients });
