import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { Tx } from '@clinks/db/scope';
import { addDays, isoWeek } from '@clinks/domain/dates';
import { pickLocale, translate } from '../i18n.ts';
import type { Services } from './context.ts';

/** What happened to a person's plan. Mails and notifications name the week, never a client. */
export type PlanEvent = 'released' | 'withdrawn' | 'changed';

export interface PlanNotice {
	userId: string;
	event: PlanEvent;
	/** The Monday of the week concerned. */
	weekStart: string;
	/**
	 * Notices with the same value for the same person are one: a release is told once, and changes in quick
	 * succession (dragging visits around) do not each send a mail.
	 */
	once: string;
}

export interface PlanMail {
	to: string;
	subject: string;
	text: string;
}

/** A stable id for a notice, so that the second insert of the same one is a no-op. */
function noticeId(tenantId: string, notice: PlanNotice): string {
	const hex = createHash('sha256')
		.update([tenantId, notice.userId, notice.event, notice.weekStart, notice.once].join('|'))
		.digest('hex');
	// Shaped as a UUID (version 8: application-defined).
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Changes within the same half hour count as one. */
export function changeWindow(now: Date): string {
	return String(Math.floor(now.getTime() / (30 * 60_000)));
}

/** The people with visits in a week: the ones a release or its withdrawal concerns. */
export async function weekAssignees(tx: Tx, tenantId: string, weekStart: string): Promise<string[]> {
	const rows = await tx
		.selectFrom('appointments')
		.select('assigneeId')
		.distinct()
		.where('tenantId', '=', tenantId)
		.where('kind', '=', 'spitex')
		.where('status', '<>', 'cancelled')
		.where('assigneeId', 'is not', null)
		.where(sql<boolean>`visit_week(tenant_id, starts_at) = ${weekStart}::date`)
		.execute();
	return rows.map((row) => row.assigneeId as string);
}

/**
 * Writes the in-app notifications in the caller's transaction and returns the mails to send once it has
 * committed. The person who made the change is not told about it.
 */
export async function recordPlanNotices(
	tx: Tx,
	services: Services,
	scope: { tenantId: string; userId: string },
	notices: readonly PlanNotice[],
): Promise<PlanMail[]> {
	const wanted = notices.filter((notice) => notice.userId !== scope.userId);
	if (wanted.length === 0) return [];
	const now = services.now();
	const fresh: PlanNotice[] = [];
	for (const notice of wanted) {
		const week = String(isoWeek(notice.weekStart));
		// By row-level security the sender may write a notification but not read it, so neither RETURNING nor
		// ON CONFLICT works here. The id is derived from the notice: a second insert of the same one fails on the
		// primary key, and the savepoint keeps that from aborting the caller's transaction.
		await sql`SAVEPOINT plan_notice`.execute(tx);
		try {
			await tx
				.insertInto('notifications')
				.values({
					id: noticeId(scope.tenantId, notice),
					tenantId: scope.tenantId,
					userId: notice.userId,
					kind: 'plan',
					message: JSON.stringify({ key: `ui.ws.notification.plan_${notice.event}`, params: { week } }),
					href: `/visits?week=${notice.weekStart}`,
					isRead: false,
					revision: 1,
					createdAt: now,
					updatedAt: now,
				})
				.execute();
			await sql`RELEASE SAVEPOINT plan_notice`.execute(tx);
			fresh.push(notice);
		} catch (error) {
			await sql`ROLLBACK TO SAVEPOINT plan_notice`.execute(tx);
			if ((error as { code?: string }).code !== '23505') throw error;
		}
	}
	if (fresh.length === 0) return [];
	const tenant = await tx
		.selectFrom('tenants')
		.select('name')
		.where('id', '=', scope.tenantId)
		.executeTakeFirstOrThrow();
	const people = await tx
		.selectFrom('users')
		.innerJoin('memberships', 'memberships.userId', 'users.id')
		.select(['users.id', 'users.email', 'users.firstName', 'users.locale', 'users.notificationPreferences'])
		.where('memberships.tenantId', '=', scope.tenantId)
		.where('memberships.status', '=', 'active')
		.where(
			'users.id',
			'in',
			fresh.map((notice) => notice.userId),
		)
		.execute();
	const mails: PlanMail[] = [];
	for (const notice of fresh) {
		const person = people.find((candidate) => candidate.id === notice.userId);
		if (!person || !person.notificationPreferences.email) continue;
		const locale = pickLocale(person.locale);
		const date = (value: string) =>
			new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
				new Date(`${value}T00:00:00Z`),
			);
		const params = {
			name: person.firstName,
			tenant: tenant.name,
			week: isoWeek(notice.weekStart),
			from: date(notice.weekStart),
			to: date(addDays(notice.weekStart, 6)),
			link: `${services.config.WEB_ORIGIN}/#/visits?week=${notice.weekStart}`,
		};
		mails.push({
			to: person.email,
			subject: translate(locale, `mail.plan.${notice.event}.subject`, params),
			text: translate(locale, `mail.plan.${notice.event}.body`, params),
		});
	}
	return mails;
}

/** After the commit. A mail that cannot be sent must not undo the plan change; the notification stands. */
export async function sendPlanMails(services: Services, mails: readonly PlanMail[]) {
	for (const mail of mails) {
		try {
			await services.mailer.send(mail);
		} catch (error) {
			console.error(JSON.stringify({ event: 'plan.mail_failed', errorType: (error as Error).name }));
		}
	}
}
