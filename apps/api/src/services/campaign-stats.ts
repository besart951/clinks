import type { Tx } from '@clinks/db/scope';
import type { CampaignStats } from '@clinks/domain/types';
import { sql } from 'kysely';

/**
 * A campaign's numbers from its outbox rows and the unsubscribes it caused: recipients (expanded audience), handed
 * over, bounced. No opens or clicks: CLinks does not track readers.
 */
export async function refreshCampaignStats(tx: Tx, campaignId: string, now: Date) {
	const mail = await tx
		.selectFrom('mailOutbox')
		.select((eb) => [
			eb.fn.countAll<string>().as('recipients'),
			eb.fn.count<string>('id').filterWhere('status', 'in', ['sent', 'bounced']).as('sent'),
			eb.fn.count<string>('id').filterWhere('status', '=', 'bounced').as('bounced'),
		])
		.where('campaignId', '=', campaignId)
		.where('kind', '=', 'campaign')
		.executeTakeFirstOrThrow();
	const { unsubscribes } = await tx
		.selectFrom('newsletterConsents')
		.select((eb) => eb.fn.countAll<string>().as('unsubscribes'))
		.where('campaignId', '=', campaignId)
		.executeTakeFirstOrThrow();
	const stats: CampaignStats = {
		recipients: Number(mail.recipients),
		sent: Number(mail.sent),
		bounced: Number(mail.bounced),
		unsubscribes: Number(unsubscribes),
	};
	await tx
		.updateTable('campaigns')
		.set((eb) => ({
			stats: sql`${JSON.stringify(stats)}::jsonb`,
			revision: eb('revision', '+', 1),
			updatedAt: now,
		}))
		.where('id', '=', campaignId)
		.execute();
}
