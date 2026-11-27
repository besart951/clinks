import type { Db } from '@clinks/db/client';
import { inScope } from '@clinks/db/scope';

/** Bodies are needed to retry and to read back a mail for a while; after that only the proof that it was sent. */
export const outboxBodyDays = 90;
export const outboxRowDays = 2 * 365;
const day = 86_400_000;

/**
 * Applies the outbox retention to every workspace not checked in the last day: bodies, attachments and headers of
 * mails older than 90 days are cleared, rows older than two years deleted. Filed copies under Mail › Gesendet are the
 * workspace's mailbox and stay; nothing raw from incoming mail is kept anywhere.
 */
export async function pruneMailOutbox(db: Db, now: Date) {
	const due = await db
		.selectFrom('auth.mailRetention')
		.select('tenantId')
		.where('checkedAt', '<', new Date(now.getTime() - day))
		.execute();
	let cleared = 0;
	for (const { tenantId } of due) {
		cleared += await inScope(db, { tenantId, userId: null }, async (tx) => {
			await tx
				.deleteFrom('mailOutbox')
				.where('createdAt', '<', new Date(now.getTime() - outboxRowDays * day))
				.execute();
			const result = await tx
				.updateTable('mailOutbox')
				.set({ textBody: '', htmlBody: '', attachments: '[]' as never, headers: '{}' as never })
				.where('createdAt', '<', new Date(now.getTime() - outboxBodyDays * day))
				.where((eb) => eb.or([eb('textBody', '!=', ''), eb('htmlBody', '!=', '')]))
				.executeTakeFirst();
			return Number(result.numUpdatedRows);
		});
		await db.updateTable('auth.mailRetention').set({ checkedAt: now }).where('tenantId', '=', tenantId).execute();
	}
	return cleared;
}
