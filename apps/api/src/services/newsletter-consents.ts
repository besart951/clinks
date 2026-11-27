import type { ConsentImportResult, ConsentInput, ConsentView } from '@clinks/contracts/newsletter';
import type { ConsentSource } from '@clinks/db/schema';
import type { Tx } from '@clinks/db/scope';
import { sql } from 'kysely';
import { hashSecret, uuid } from '../crypto.ts';
import { ApiError } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import { refreshCampaignStats } from './campaign-stats.ts';
import type { Services } from './context.ts';
import { withPermission } from './permissions.ts';

export interface ConsentEntry {
	tenantId: string;
	contactId: string;
	status: 'subscribed' | 'unsubscribed';
	source: ConsentSource;
	consentText?: string;
	note?: string;
	ipHash?: string | null;
	actorId?: string | null;
	/** An unsubscribe through a campaign's link counts for that campaign. */
	campaignId?: string | null;
}

/**
 * The one way a contact's newsletter status changes: the entry is logged for proof, the synced status follows, and
 * the address is blocked for newsletters (unsubscribed) or unblocked again (a new consent).
 */
export async function recordConsent(tx: Tx, entry: ConsentEntry, now: Date) {
	const contact = await tx
		.updateTable('contacts')
		.set((eb) => ({ newsletter: entry.status, revision: eb('revision', '+', 1), updatedAt: now }))
		.where('id', '=', entry.contactId)
		.returning('email')
		.executeTakeFirst();
	if (!contact) throw new ApiError(404, 'error.ws.not_found');
	await tx
		.insertInto('newsletterConsents')
		.values({
			id: uuid(),
			tenantId: entry.tenantId,
			contactId: entry.contactId,
			status: entry.status,
			source: entry.source,
			consentText: entry.consentText ?? '',
			note: entry.note ?? '',
			ipHash: entry.ipHash ?? null,
			actorId: entry.actorId ?? null,
			campaignId: entry.campaignId ?? null,
			createdAt: now,
		})
		.execute();
	const address = String(contact.email).toLowerCase();
	if (address && entry.status === 'unsubscribed')
		await tx
			.insertInto('mailSuppressions')
			.values({ tenantId: entry.tenantId, address, scope: 'newsletter', reason: 'unsubscribed' })
			.onConflict((conflict) => conflict.doNothing())
			.execute();
	if (address && entry.status === 'subscribed')
		await tx.deleteFrom('mailSuppressions').where('address', '=', address).where('scope', '=', 'newsletter').execute();
	if (entry.campaignId) await refreshCampaignStats(tx, entry.campaignId, now);
}

/** The IP of a consent, kept only as a hash per workspace: enough to show it was one person, not who. */
export function ipHash(tenantId: string, ip: string | null) {
	return ip ? hashSecret(`${tenantId}:${ip}`).toString('base64url').slice(0, 22) : null;
}

/** Consent on the contact page and by import (mail module). */
export class NewsletterConsents {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	history(claims: AccessClaims, contactId: string): Promise<ConsentView[]> {
		return withPermission(this.#services.db, claims, 'contacts.read', async (tx) => {
			const rows = await tx
				.selectFrom('newsletterConsents')
				.leftJoin('users', 'users.id', 'newsletterConsents.actorId')
				.select([
					'newsletterConsents.id',
					'newsletterConsents.status',
					'newsletterConsents.source',
					'newsletterConsents.consentText',
					'newsletterConsents.note',
					'newsletterConsents.createdAt',
					sql<string | null>`nullif(trim(users.first_name || ' ' || users.last_name), '')`.as('actorName'),
				])
				.where('newsletterConsents.contactId', '=', contactId)
				.orderBy('newsletterConsents.createdAt', 'desc')
				.execute();
			return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
		});
	}

	/** «Einwilligung erfassen» or «Abmelden» on the contact page. */
	record(claims: AccessClaims, contactId: string, input: ConsentInput): Promise<void> {
		return withPermission(this.#services.db, claims, 'mail.write', (tx, scope) =>
			recordConsent(
				tx,
				{
					tenantId: scope.tenantId,
					contactId,
					status: input.status,
					source: 'manual',
					note: input.note,
					actorId: scope.userId,
				},
				this.#services.now(),
			),
		);
	}

	/** Consents gathered elsewhere, for contacts that exist already; other addresses are reported back. */
	import(claims: AccessClaims, input: { emails: string[]; note: string }): Promise<ConsentImportResult> {
		return withPermission(this.#services.db, claims, 'mail.write', async (tx, scope) => {
			const wanted = [...new Set(input.emails.map((email) => email.toLowerCase()))];
			const contacts = await tx
				.selectFrom('contacts')
				.select(['id', 'email', 'newsletter'])
				.where((eb) => eb(eb.fn('lower', ['email']), 'in', wanted))
				.execute();
			const known = new Set(contacts.map((contact) => String(contact.email).toLowerCase()));
			const now = this.#services.now();
			for (const contact of contacts)
				if (contact.newsletter !== 'subscribed')
					await recordConsent(
						tx,
						{
							tenantId: scope.tenantId,
							contactId: String(contact.id),
							status: 'subscribed',
							source: 'import',
							note: input.note,
							actorId: scope.userId,
						},
						now,
					);
			return { subscribed: contacts.length, unknown: wanted.filter((email) => !known.has(email)) };
		});
	}
}
