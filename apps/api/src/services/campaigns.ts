import { publicRoutes, unsubscribeEndpoint, webLink } from '@clinks/contracts/public-links';
import type { AudienceView } from '@clinks/contracts/newsletter';
import type { Db } from '@clinks/db/client';
import { inScope, type Tx } from '@clinks/db/scope';
import { campaignChecks, mayApprove } from '@clinks/domain/campaigns';
import { roleGrants } from '@clinks/domain/permissions';
import { fillPlaceholders } from '@clinks/domain/placeholders';
import type { CampaignStatus, Contact, Permission, RoleKind } from '@clinks/domain/types';
import { blocksFromText } from '@clinks/mail-layout/layout';
import { sql } from 'kysely';
import { ApiError } from '../errors.ts';
import { pickLocale, translate } from '../i18n.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import { refreshCampaignStats } from './campaign-stats.ts';
import type { Caller, Services } from './context.ts';
import { defaultSender } from './mail-senders.ts';
import { enqueueMail } from './outbox.ts';
import { withPermission, type MemberScope } from './permissions.ts';
import { unsubscribeToken } from './unsubscribe.ts';

type Recipient = Pick<Contact, 'kind' | 'firstName' | 'lastName' | 'companyName' | 'email'> & { id: string };

/**
 * The newsletter workflow: draft → review → approved → scheduled → sent. Clients edit only the content (sync); every
 * step of the workflow goes through here, so the four-eyes rule and the audience hold.
 */
export class Campaigns {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	/** Who it reaches now: the tag's subscribed contacts with an address, minus blocked addresses. */
	audience(claims: AccessClaims, id: string): Promise<AudienceView> {
		return withPermission(this.#services.db, claims, 'mail.read', async (tx) => {
			const campaign = await this.#campaign(tx, id);
			const tagged = await subscribedWithTag(tx, campaign.audienceTag, false);
			const reached = await subscribedWithTag(tx, campaign.audienceTag, true);
			return { count: reached.length, suppressed: tagged.length - reached.length };
		});
	}

	review(claims: AccessClaims, id: string, caller: Caller) {
		return this.#step(claims, id, ['draft'], 'review', caller, async (tx, campaign, scope) => {
			const reached = await subscribedWithTag(tx, campaign.audienceTag, true);
			if (campaignChecks(campaign, reached.length).some((check) => check.level === 'error'))
				throw new ApiError(400, 'error.ws.campaign_not_ready');
			return { submittedBy: scope.userId };
		});
	}

	/** Back to draft from any step before sending; approval and schedule are dropped. */
	withdraw(claims: AccessClaims, id: string, caller: Caller) {
		return this.#step(claims, id, ['review', 'approved', 'scheduled'], 'draft', caller, async (tx) => {
			await tx.deleteFrom('auth.campaignQueue').where('campaignId', '=', id).execute();
			return { approvedBy: null, scheduledAt: null, submittedBy: null };
		});
	}

	approve(claims: AccessClaims, id: string, caller: Caller) {
		return this.#step(claims, id, ['review'], 'approved', caller, async (tx, campaign, scope) => {
			if (!mayApprove(campaign, scope.userId, await writers(tx, scope.tenantId)))
				throw new ApiError(403, 'error.ws.campaign_second_person');
			return { approvedBy: scope.userId };
		});
	}

	/** «Planen» at `at`, or «Jetzt senden» with null: the worker sends it once it is due. */
	schedule(claims: AccessClaims, id: string, at: string | null, caller: Caller) {
		return this.#step(claims, id, ['approved'], 'scheduled', caller, async (tx, _campaign, scope) => {
			const now = this.#services.now();
			const due = at ? new Date(at) : now;
			if (due.getTime() < now.getTime() - 60_000) throw new ApiError(400, 'error.ws.campaign_in_past');
			await tx
				.insertInto('auth.campaignQueue')
				.values({ campaignId: id, tenantId: scope.tenantId, dueAt: due })
				.execute();
			return { scheduledAt: due };
		});
	}

	/** A copy to the caller, marked as a test; it counts for nothing and has no working unsubscribe link. */
	test(claims: AccessClaims, id: string): Promise<void> {
		return withPermission(this.#services.db, claims, 'mail.write', async (tx, scope) => {
			const campaign = await this.#campaign(tx, id);
			const me = await tx
				.selectFrom('users')
				.select(['email', 'firstName', 'lastName'])
				.where('id', '=', scope.userId)
				.executeTakeFirstOrThrow();
			const compose = await campaignComposer(tx, this.#services, scope.tenantId, campaign);
			const mail = compose({ id: scope.userId, kind: 'person', companyName: '', ...me }, null);
			await enqueueMail(tx, scope.tenantId, { ...mail, subject: `[Test] ${mail.subject}` });
		});
	}

	async #step(
		claims: AccessClaims,
		id: string,
		from: CampaignStatus[],
		to: CampaignStatus,
		caller: Caller,
		change: (tx: Tx, campaign: StoredCampaign, scope: MemberScope) => Promise<Record<string, unknown>>,
	): Promise<void> {
		return withPermission(this.#services.db, claims, 'mail.write', async (tx, scope) => {
			const campaign = await this.#campaign(tx, id, true);
			if (!from.includes(campaign.status)) throw new ApiError(409, 'error.ws.campaign_wrong_step');
			const values = await change(tx, campaign, scope);
			await tx
				.updateTable('campaigns')
				.set((eb) => ({ ...values, status: to, revision: eb('revision', '+', 1), updatedAt: this.#services.now() }))
				.where('id', '=', id)
				.execute();
			await audit(
				tx,
				{ action: `campaign.${to}`, actorId: scope.userId, tenantId: scope.tenantId, target: id },
				caller,
			);
		});
	}

	async #campaign(tx: Tx, id: string, lock = false): Promise<StoredCampaign> {
		const campaign = await findCampaign(tx, id, lock);
		if (!campaign) throw new ApiError(404, 'error.ws.not_found');
		return campaign;
	}
}

interface StoredCampaign {
	id: string;
	subject: string;
	previewText: string;
	body: string;
	audienceTag: string;
	status: CampaignStatus;
	submittedBy: string | null;
}

/**
 * Sends due campaigns: each becomes one outbox mail per recipient (the outbox throttles the sending), then counts as
 * sent. Runs on the worker's timer and claims campaigns with SKIP LOCKED, so several API instances share the work.
 */
export class CampaignDispatcher {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	async dispatch(): Promise<number> {
		const now = this.#services.now();
		const due = await claimDue(this.#services.db, now);
		for (const row of due)
			await inScope(this.#services.db, { tenantId: row.tenantId, userId: null }, (tx) =>
				this.#send(tx, row.tenantId, row.campaignId, now),
			);
		return due.length;
	}

	async #send(tx: Tx, tenantId: string, campaignId: string, now: Date) {
		const campaign = await findCampaign(tx, campaignId, true);
		if (campaign?.status !== 'scheduled') return;
		const compose = await campaignComposer(tx, this.#services, tenantId, campaign);
		for (const recipient of await subscribedWithTag(tx, campaign.audienceTag, true))
			await enqueueMail(tx, tenantId, compose(recipient, { contactId: recipient.id, campaignId: campaign.id }));
		await tx.updateTable('campaigns').set({ status: 'sent', sentAt: now }).where('id', '=', campaignId).execute();
		await refreshCampaignStats(tx, campaignId, now);
	}
}

async function findCampaign(tx: Tx, id: string, lock: boolean): Promise<StoredCampaign | undefined> {
	let query = tx
		.selectFrom('campaigns')
		.select(['id', 'subject', 'previewText', 'body', 'audienceTag', 'status', 'submittedBy'])
		.where('id', '=', id);
	if (lock) query = query.forUpdate();
	// Synced columns are untyped in the schema.
	return (await query.executeTakeFirst()) as unknown as StoredCampaign | undefined;
}

/** Takes the due campaigns off the queue in one statement; a crash before the commit puts them back. */
async function claimDue(db: Db, now: Date) {
	return db
		.deleteFrom('auth.campaignQueue')
		.where(
			'campaignId',
			'in',
			db
				.selectFrom('auth.campaignQueue')
				.select('campaignId')
				.where('dueAt', '<=', now)
				.limit(20)
				.forUpdate()
				.skipLocked(),
		)
		.returning(['campaignId', 'tenantId'])
		.execute();
}

/**
 * Writes a campaign's mails: the workspace, its newsletter sender and the texts are read once, then each recipient
 * gets their placeholders filled and their own unsubscribe link (footer and RFC 8058 headers). A test copy has no
 * contact, so its link opens a page that says the link is not valid.
 */
async function campaignComposer(tx: Tx, services: Services, tenantId: string, campaign: StoredCampaign) {
	const tenant = await tx.selectFrom('tenants').select(['name', 'locale']).executeTakeFirstOrThrow();
	const sender = await defaultSender(tx, 'newsletter');
	const label = translate(pickLocale(tenant.locale), 'mail.newsletter.unsubscribe');
	return (recipient: Recipient, link: { contactId: string; campaignId: string | null } | null) => {
		const token = link ? unsubscribeToken(services, { tenantId, ...link }) : 'test';
		const oneClick = unsubscribeEndpoint(services.config.API_ORIGIN, token);
		return {
			kind: 'campaign' as const,
			to: recipient.email,
			subject: fillPlaceholders(campaign.subject, recipient, tenant.name),
			content: {
				preheader: campaign.previewText || undefined,
				blocks: blocksFromText(fillPlaceholders(campaign.body, recipient, tenant.name)),
			},
			sender,
			contactId: link?.contactId ?? null,
			campaignId: link?.campaignId ?? undefined,
			file: false,
			headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
			extras: { unsubscribe: { label, href: webLink(services.config.WEB_ORIGIN, publicRoutes.unsubscribe(token)) } },
		};
	};
}

/** Contacts with the tag who subscribed; with `reachable`, only those whose address is not blocked. */
async function subscribedWithTag(tx: Tx, tag: string, reachable: boolean): Promise<Recipient[]> {
	if (!tag) return [];
	let query = tx
		.selectFrom('contacts')
		.select(['id', 'kind', 'firstName', 'lastName', 'companyName', 'email'])
		.where('newsletter', '=', 'subscribed')
		.where('archived', '=', false)
		.where('email', '!=', '')
		.where(sql<boolean>`tags @> ${JSON.stringify([tag])}::jsonb`);
	if (reachable)
		query = query.where(({ not, exists, selectFrom }) =>
			not(
				exists(
					selectFrom('mailSuppressions')
						.select('address')
						.whereRef('mailSuppressions.address', '=', sql<string>`lower(contacts.email)`)
						.where('mailSuppressions.scope', 'in', ['all', 'newsletter']),
				),
			),
		);
	return (await query.execute()) as unknown as Recipient[];
}

/** Active members whose role may write mail: the four-eyes rule applies once there are two. */
async function writers(tx: Tx, tenantId: string) {
	const roles = await tx
		.selectFrom('memberships')
		.innerJoin('roles', 'roles.id', 'memberships.roleId')
		.select(['roles.kind', 'roles.permissions'])
		.where('memberships.tenantId', '=', tenantId)
		.where('memberships.status', '=', 'active')
		.execute();
	return roles.filter((role) =>
		roleGrants({ kind: role.kind as RoleKind, permissions: role.permissions as Permission[] }, 'mail.write'),
	).length;
}
