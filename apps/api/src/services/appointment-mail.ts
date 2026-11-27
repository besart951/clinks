import type { Db } from '@clinks/db/client';
import { inScope, type Tx } from '@clinks/db/scope';
import {
	appointmentWhen,
	defaultAppointmentMail,
	mailable,
	reminderDue,
	type AppointmentMailSettings,
} from '@clinks/domain/appointment-mail';
import { contactName } from '@clinks/domain/contacts';
import type { Address, Appointment, Contact } from '@clinks/domain/types';
import { blocksFromText } from '@clinks/mail-layout/layout';
import { sql } from 'kysely';
import { pickLocale, translate } from '../i18n.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { defaultSender } from './mail-senders.ts';
import { enqueueMail } from './outbox.ts';
import { withPermission } from './permissions.ts';

type MailedAppointment = Pick<Appointment, 'id' | 'kind' | 'status' | 'start' | 'arrivalWindow' | 'contactId'> & {
	remindedAt?: string | null;
};
type Recipient = Pick<Contact, 'kind' | 'firstName' | 'lastName' | 'companyName' | 'email' | 'archived'> & {
	reminders?: boolean | null;
	language?: string | null;
};

/**
 * After an appointment is saved (sync) or deleted: a confirmation when it is new or moved, and its reminder queued
 * for when it is due. Moving clears an earlier reminder, so the new time is reminded again.
 */
export async function appointmentChanged(
	tx: Tx,
	services: Services,
	tenantId: string,
	before: MailedAppointment | null,
	after: MailedAppointment | null,
) {
	const id = (after ?? before)!.id;
	await tx.deleteFrom('auth.appointmentReminders').where('appointmentId', '=', id).execute();
	if (!after) return;
	const now = services.now();
	const moved = !before || before.start !== after.start;
	if (moved && before?.remindedAt)
		await tx.updateTable('appointments').set({ remindedAt: null }).where('id', '=', id).execute();
	const settings = await settingsOf(tx);
	const contact = await recipientOf(tx, after.contactId);
	if (!mailable(after, contact, settings) || new Date(after.start) <= now) return;
	const due = reminderDue(after.start, settings);
	if (due && due > now && (moved || !after.remindedAt))
		await tx.insertInto('auth.appointmentReminders').values({ appointmentId: id, tenantId, dueAt: due }).execute();
	// Spitex plans are drafts until the week is released and change often: visits get reminders, no confirmations.
	if (moved && settings.confirmation && after.kind !== 'spitex')
		await enqueueMail(tx, tenantId, await appointmentMail(tx, 'confirmation', after, contact!));
}

/** Settings › E-Mail › Termine. Saving puts the reminders of upcoming appointments on the new schedule. */
export class AppointmentMailService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	get(claims: AccessClaims): Promise<AppointmentMailSettings> {
		return withPermission(this.#services.db, claims, 'settings.manage', settingsOf);
	}

	save(claims: AccessClaims, input: AppointmentMailSettings, caller: Caller): Promise<void> {
		return withPermission(this.#services.db, claims, 'settings.manage', async (tx, scope) => {
			await tx
				.updateTable('tenants')
				.set((eb) => ({
					appointmentMail: JSON.stringify(input) as never,
					revision: eb('revision', '+', 1),
					updatedAt: this.#services.now(),
				}))
				.where('id', '=', scope.tenantId)
				.execute();
			await reschedule(tx, scope.tenantId, input, this.#services.now());
			await audit(
				tx,
				{ action: 'tenant.appointment_mail', actorId: scope.userId, tenantId: scope.tenantId, target: scope.tenantId },
				caller,
			);
		});
	}
}

/** Sends due reminders. Runs on the worker's timer and claims rows with SKIP LOCKED, like the campaign queue. */
export class AppointmentReminders {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	async dispatch(): Promise<number> {
		const now = this.#services.now();
		const due = await claimDue(this.#services.db, now);
		for (const row of due)
			await inScope(this.#services.db, { tenantId: row.tenantId, userId: null }, (tx) =>
				this.#remind(tx, row.tenantId, row.appointmentId, now),
			);
		return due.length;
	}

	/** Checked again at sending: the contact may have turned reminders off, the appointment may be cancelled. */
	async #remind(tx: Tx, tenantId: string, appointmentId: string, now: Date) {
		const appointment = (await tx
			.selectFrom('appointments')
			.select(['id', 'kind', 'status', 'startsAt as start', 'arrivalWindow', 'contactId', 'remindedAt', 'published'])
			.where('id', '=', appointmentId)
			.forUpdate()
			.executeTakeFirst()) as unknown as (MailedAppointment & { start: Date | string; published: boolean }) | undefined;
		// A visit of a week not released yet may still move: it is not reminded.
		if (!appointment || appointment.remindedAt || (appointment.kind === 'spitex' && !appointment.published)) return;
		const start = new Date(appointment.start).toISOString();
		const settings = await settingsOf(tx);
		const contact = await recipientOf(tx, appointment.contactId);
		if (!settings.reminder || !mailable(appointment, contact, settings) || new Date(start) <= now) return;
		await enqueueMail(tx, tenantId, await appointmentMail(tx, 'reminder', { ...appointment, start }, contact!));
		await tx.updateTable('appointments').set({ remindedAt: now }).where('id', '=', appointmentId).execute();
	}
}

/** The reminders of upcoming appointments after the settings changed: off removes them, new hours move them. */
async function reschedule(tx: Tx, tenantId: string, settings: AppointmentMailSettings, now: Date) {
	await tx.deleteFrom('auth.appointmentReminders').where('tenantId', '=', tenantId).execute();
	if (!settings.reminder) return;
	const hours = sql`make_interval(hours => ${settings.hoursBefore})`;
	await tx
		.insertInto('auth.appointmentReminders')
		.columns(['appointmentId', 'tenantId', 'dueAt'])
		.expression((eb) =>
			eb
				.selectFrom('appointments')
				.select(['id', 'tenantId', sql<Date>`starts_at - ${hours}`.as('dueAt')])
				.where('contactId', 'is not', null)
				.where('status', '!=', 'cancelled')
				.where('remindedAt', 'is', null)
				.where(sql<boolean>`starts_at - ${hours} > ${now}`),
		)
		.execute();
}

async function claimDue(db: Db, now: Date) {
	return db
		.deleteFrom('auth.appointmentReminders')
		.where(
			'appointmentId',
			'in',
			db
				.selectFrom('auth.appointmentReminders')
				.select('appointmentId')
				.where('dueAt', '<=', now)
				.limit(50)
				.forUpdate()
				.skipLocked(),
		)
		.returning(['appointmentId', 'tenantId'])
		.execute();
}

async function settingsOf(tx: Tx): Promise<AppointmentMailSettings> {
	const tenant = await tx.selectFrom('tenants').select('appointmentMail').executeTakeFirstOrThrow();
	return { ...defaultAppointmentMail, ...(tenant.appointmentMail as Partial<AppointmentMailSettings> | null) };
}

async function recipientOf(tx: Tx, contactId: string | null): Promise<Recipient | null> {
	if (!contactId) return null;
	const row = await tx
		.selectFrom('contacts')
		.select(['kind', 'firstName', 'lastName', 'companyName', 'email', 'archived', 'reminders', 'language'])
		.where('id', '=', contactId)
		.executeTakeFirst();
	// Contact columns are untyped in the schema.
	return (row as unknown as Recipient | undefined) ?? null;
}

/**
 * The mail itself: the workspace, date and time (or the arrival window) and the practice's address, in the
 * contact's language. Never the title, service, notes or anything else that tells what the appointment is for.
 */
async function appointmentMail(
	tx: Tx,
	kind: 'confirmation' | 'reminder',
	appointment: MailedAppointment,
	contact: Recipient,
) {
	const tenant = await tx
		.selectFrom('tenants')
		.select(['name', 'address', 'locale', 'timeZone', 'appointmentMail'])
		.executeTakeFirstOrThrow();
	const locale = pickLocale(contact.language || tenant.locale);
	const when = appointmentWhen(appointment, tenant.timeZone || 'Europe/Zurich', locale);
	const address = tenant.address as Address;
	const params = {
		name: contactName(contact),
		tenant: tenant.name,
		date: when.date,
		when: when.window
			? translate(locale, 'mail.appointment.when_window', { date: when.date, ...when.window })
			: translate(locale, 'mail.appointment.when_time', { date: when.date, time: when.time! }),
		address: [`${address.street} ${address.houseNumber}`.trim(), `${address.zip} ${address.city}`.trim()]
			.filter(Boolean)
			.join(', '),
	};
	const own = (tenant.appointmentMail as Partial<AppointmentMailSettings> | null)?.text?.trim();
	const text = [
		translate(locale, `mail.appointment.${kind}_body`, params),
		own,
		translate(locale, 'mail.appointment.cancel'),
	]
		.filter(Boolean)
		.join('\n\n');
	return {
		kind: 'appointment' as const,
		to: contact.email,
		subject: translate(locale, `mail.appointment.${kind}_subject`, params),
		content: { blocks: blocksFromText(text) },
		sender: await defaultSender(tx, 'business'),
		contactId: appointment.contactId,
	};
}
