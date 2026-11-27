import type { AccessClaims } from '../tokens.ts';
import type { Services } from './context.ts';
import { withPermission } from './permissions.ts';

/**
 * The mail part of the workspace's data export, which the synced tables do not cover: domains (public key only,
 * never the DKIM private key), senders, sign-up forms, the consent log, blocked addresses, the appointment-mail
 * settings, and the outbox as a log without bodies (they are deleted after 90 days anyway).
 */
export class MailExport {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	export(claims: AccessClaims): Promise<Record<string, unknown[]>> {
		return withPermission(this.#services.db, claims, 'settings.manage', async (tx) => ({
			mailDomains: await tx
				.selectFrom('mailDomains')
				.select(['id', 'domain', 'purpose', 'selector', 'dkimPublicKey', 'status', 'checkedAt', 'createdAt'])
				.execute(),
			mailSenders: await tx.selectFrom('mailSenders').selectAll().execute(),
			newsletterForms: await tx.selectFrom('newsletterForms').selectAll().execute(),
			newsletterConsents: await tx.selectFrom('newsletterConsents').selectAll().execute(),
			mailSuppressions: await tx.selectFrom('mailSuppressions').selectAll().execute(),
			mailOutbox: await tx
				.selectFrom('mailOutbox')
				.select([
					'id',
					'kind',
					'recipient',
					'subject',
					'fromName',
					'status',
					'attempts',
					'contactId',
					'campaignId',
					'messageId',
					'createdAt',
					'sentAt',
				])
				.orderBy('createdAt')
				.execute(),
		}));
	}
}
