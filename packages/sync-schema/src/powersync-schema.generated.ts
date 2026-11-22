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

export const powerSyncSchema = new Schema({ contacts, appointments });
