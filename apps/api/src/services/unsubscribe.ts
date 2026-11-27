import type { UnsubscribeView } from '@clinks/contracts/newsletter';
import { inScope } from '@clinks/db/scope';
import { timingSafeEqual } from 'node:crypto';
import { base32Uuid, uuidFromBase32, uuidToBase32 } from '../crypto.ts';
import { ApiError } from '../errors.ts';
import { enforceRateLimit } from '../rate-limit.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { recordConsent } from './newsletter-consents.ts';

const macContext = 'unsubscribe';

interface UnsubscribeTarget {
	tenantId: string;
	contactId: string;
	campaignId: string | null;
}

/**
 * The token in every newsletter's unsubscribe link: workspace, contact and campaign in base32 plus a MAC, so the link
 * works without a stored token and cannot be made for someone else. It does not expire: unsubscribing must always
 * work (UWG, RFC 8058).
 */
export function unsubscribeToken(services: Pick<Services, 'secrets'>, target: UnsubscribeTarget) {
	const body = [target.tenantId, target.contactId, target.campaignId]
		.map((id) => (id ? uuidToBase32(id) : 'x'))
		.join('-');
	return `${body}-${services.secrets.mac(body, macContext)}`;
}

export function readUnsubscribeToken(services: Pick<Services, 'secrets'>, token: string): UnsubscribeTarget | null {
	const match = new RegExp(`^(${base32Uuid})-(${base32Uuid})-(${base32Uuid}|x)-([A-Za-z0-9_-]{22})$`).exec(token);
	if (!match) return null;
	const expected = Buffer.from(services.secrets.mac(`${match[1]}-${match[2]}-${match[3]}`, macContext));
	const given = Buffer.from(match[4]);
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
	return {
		tenantId: uuidFromBase32(match[1]),
		contactId: uuidFromBase32(match[2]),
		campaignId: match[3] === 'x' ? null : uuidFromBase32(match[3]),
	};
}

/** The recipient's side: the page behind the link, and the one-click POST mail apps send (RFC 8058). */
export class Unsubscribe {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	view(token: string): Promise<UnsubscribeView> {
		const target = this.#target(token);
		return inScope(this.#services.db, { tenantId: target.tenantId, userId: null }, async (tx) => {
			const tenant = await tx.selectFrom('tenants').select('name').executeTakeFirstOrThrow();
			const contact = await tx
				.selectFrom('contacts')
				.select('newsletter')
				.where('id', '=', target.contactId)
				.executeTakeFirst();
			return { tenantName: tenant.name, done: !contact || contact.newsletter === 'unsubscribed' };
		});
	}

	/** Idempotent: a second click (or the mail app and the page both) changes nothing. */
	unsubscribe(token: string, caller: Caller): Promise<void> {
		enforceRateLimit(this.#services.limiter, `unsubscribe:${caller.ip ?? 'unknown'}`, 30);
		const target = this.#target(token);
		return inScope(this.#services.db, { tenantId: target.tenantId, userId: null }, async (tx) => {
			const contact = await tx
				.selectFrom('contacts')
				.select('newsletter')
				.where('id', '=', target.contactId)
				.forUpdate()
				.executeTakeFirst();
			if (!contact || contact.newsletter === 'unsubscribed') return;
			await recordConsent(
				tx,
				{
					tenantId: target.tenantId,
					contactId: target.contactId,
					status: 'unsubscribed',
					source: 'unsubscribe_link',
					campaignId: target.campaignId,
				},
				this.#services.now(),
			);
			await audit(
				tx,
				{ action: 'newsletter.unsubscribed', actorId: null, tenantId: target.tenantId, target: target.contactId },
				caller,
			);
		});
	}

	/** The optional «Warum?» after unsubscribing; kept in the audit log (the consent log is never rewritten). */
	reason(token: string, reason: string, caller: Caller): Promise<void> {
		enforceRateLimit(this.#services.limiter, `unsubscribe:${caller.ip ?? 'unknown'}`, 30);
		const target = this.#target(token);
		if (!reason) return Promise.resolve();
		return inScope(this.#services.db, { tenantId: target.tenantId, userId: null }, async (tx) => {
			await audit(
				tx,
				{
					action: 'newsletter.unsubscribe_reason',
					actorId: null,
					tenantId: target.tenantId,
					target: target.contactId,
					meta: { reason },
				},
				caller,
			);
		});
	}

	#target(token: string) {
		const target = readUnsubscribeToken(this.#services, token);
		if (!target) throw new ApiError(404, 'error.ws.newsletter_link_invalid');
		return target;
	}
}
