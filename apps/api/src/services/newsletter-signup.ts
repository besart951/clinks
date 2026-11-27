import type {
	ConfirmedView,
	NewsletterFormInput,
	NewsletterFormView,
	PublicFormView,
	SignUpInput,
} from '@clinks/contracts/newsletter';
import type { Db } from '@clinks/db/client';
import { inScope, type Tx } from '@clinks/db/scope';
import { blocksFromText } from '@clinks/mail-layout/layout';
import { sql } from 'kysely';
import { base32Uuid, randomLocalPart, uuid, uuidFromBase32, uuidToBase32 } from '../crypto.ts';
import { ApiError } from '../errors.ts';
import { pickLocale, translate } from '../i18n.ts';
import { enforceRateLimit } from '../rate-limit.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { defaultSender } from './mail-senders.ts';
import { ipHash, recordConsent } from './newsletter-consents.ts';
import { findLink, issueLink, useUp } from './one-time.ts';
import { enqueueMail } from './outbox.ts';
import { withPermission } from './permissions.ts';

const formColumns = ['id', 'token', 'title', 'intro', 'tags', 'consentText', 'active'] as const;

/** Settings › E-Mail › Anmeldeformulare. */
export class NewsletterForms {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	list(claims: AccessClaims): Promise<NewsletterFormView[]> {
		return withPermission(this.#services.db, claims, 'settings.manage', (tx) =>
			tx.selectFrom('newsletterForms').select(formColumns).orderBy('createdAt').execute(),
		);
	}

	save(claims: AccessClaims, id: string | null, input: NewsletterFormInput, caller: Caller) {
		return withPermission(this.#services.db, claims, 'settings.manage', async (tx, scope) => {
			const values = { ...input, tags: JSON.stringify(input.tags) as never, updatedAt: this.#services.now() };
			const saved = id
				? await tx
						.updateTable('newsletterForms')
						.set(values)
						.where('id', '=', id)
						.returning(formColumns)
						.executeTakeFirst()
				: await tx
						.insertInto('newsletterForms')
						.values({ ...values, id: uuid(), tenantId: scope.tenantId, token: formToken(scope.tenantId) })
						.returning(formColumns)
						.executeTakeFirstOrThrow();
			if (!saved) throw new ApiError(404, 'error.ws.not_found');
			await audit(
				tx,
				{ action: 'newsletter.form_saved', actorId: scope.userId, tenantId: scope.tenantId, target: saved.id },
				caller,
			);
			return saved;
		});
	}

	remove(claims: AccessClaims, id: string, caller: Caller) {
		return withPermission(this.#services.db, claims, 'settings.manage', async (tx, scope) => {
			const removed = await tx.deleteFrom('newsletterForms').where('id', '=', id).executeTakeFirst();
			if (removed.numDeletedRows === 0n) throw new ApiError(404, 'error.ws.not_found');
			await audit(
				tx,
				{ action: 'newsletter.form_removed', actorId: scope.userId, tenantId: scope.tenantId, target: id },
				caller,
			);
		});
	}
}

/**
 * The public side of a sign-up form, with double opt-in: the form sends a confirmation link, and only the click on it
 * adds the person (contact, tags, consent with the text they saw). Nothing about them is kept before that, except
 * the request itself, which is deleted after seven days.
 */
export class NewsletterSignUp {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	form(token: string): Promise<PublicFormView> {
		return this.#inForm(token, async (tx, form) => ({
			tenantName: await tenantName(tx),
			title: form.title,
			intro: form.intro,
			consentText: form.consentText,
		}));
	}

	/** Always answers the same, so the form does not tell whether an address is subscribed already. */
	signUp(token: string, input: SignUpInput, caller: Caller): Promise<void> {
		enforceRateLimit(this.#services.limiter, `newsletter-signup:${caller.ip ?? 'unknown'}`, 10);
		if (input.website) return Promise.resolve();
		return this.#inForm(token, async (tx, form, tenantId) => {
			const now = this.#services.now();
			const requestId = uuid();
			await tx
				.insertInto('newsletterRequests')
				.values({
					id: requestId,
					tenantId,
					formId: form.id,
					firstName: input.firstName,
					lastName: input.lastName,
					email: input.email.toLowerCase(),
					ipHash: ipHash(tenantId, caller.ip),
					createdAt: now,
				})
				.execute();
			const link = await issueLink(tx, { purpose: 'newsletter_optin', tenantId, newsletterRequestId: requestId, now });
			const tenant = await tx.selectFrom('tenants').select(['name', 'locale']).executeTakeFirstOrThrow();
			const locale = pickLocale(tenant.locale);
			const params = {
				tenant: tenant.name,
				name: input.firstName,
				link: `${this.#services.config.WEB_ORIGIN}/#/newsletter/confirm/${encodeURIComponent(link.token)}`,
			};
			await enqueueMail(tx, tenantId, {
				kind: 'optin',
				to: input.email,
				subject: translate(locale, 'mail.newsletter.optin_subject', params),
				content: {
					blocks: blocksFromText(
						translate(locale, 'mail.newsletter.optin_body', params),
						translate(locale, 'mail.newsletter.optin_button'),
					),
				},
				sender: await defaultSender(tx, 'newsletter'),
			});
		});
	}

	/** The click on the confirmation link: subscribes, gives the form's tags and records the consent. */
	async confirm(token: string, caller: Caller): Promise<ConfirmedView> {
		const now = this.#services.now();
		const link = await findLink(this.#services.db, 'newsletter_optin', token, now);
		if (!link?.tenantId || !link.newsletterRequestId) throw new ApiError(410, 'error.ws.newsletter_link_invalid');
		const { tenantId, newsletterRequestId } = link;
		return inScope(this.#services.db, { tenantId, userId: null }, async (tx) => {
			if (!(await useUp(tx, link.id, now))) throw new ApiError(410, 'error.ws.newsletter_link_invalid');
			const request = await tx
				.selectFrom('newsletterRequests')
				.innerJoin('newsletterForms', 'newsletterForms.id', 'newsletterRequests.formId')
				.select([
					'newsletterRequests.firstName',
					'newsletterRequests.lastName',
					'newsletterRequests.email',
					'newsletterRequests.ipHash',
					'newsletterForms.tags',
					'newsletterForms.consentText',
				])
				.where('newsletterRequests.id', '=', newsletterRequestId)
				.executeTakeFirst();
			if (!request) throw new ApiError(410, 'error.ws.newsletter_link_invalid');
			const contactId = await contactWithTags(tx, tenantId, request, now);
			await recordConsent(
				tx,
				{
					tenantId,
					contactId,
					status: 'subscribed',
					source: 'form',
					consentText: request.consentText,
					ipHash: request.ipHash,
				},
				now,
			);
			await tx.deleteFrom('newsletterRequests').where('id', '=', newsletterRequestId).execute();
			await audit(tx, { action: 'newsletter.confirmed', actorId: null, tenantId, target: contactId }, caller);
			return { tenantName: await tenantName(tx) };
		});
	}

	async #inForm<T>(
		token: string,
		work: (
			tx: Tx,
			form: { id: string; title: string; intro: string; consentText: string },
			tenantId: string,
		) => Promise<T>,
	): Promise<T> {
		const tenantId = tenantOfFormToken(token);
		if (!tenantId) throw new ApiError(404, 'error.ws.newsletter_form_unknown');
		return inScope(this.#services.db, { tenantId, userId: null }, async (tx) => {
			const form = await tx
				.selectFrom('newsletterForms')
				.select(['id', 'title', 'intro', 'consentText'])
				.where('token', '=', token)
				.where('active', '=', true)
				.executeTakeFirst();
			if (!form) throw new ApiError(404, 'error.ws.newsletter_form_unknown');
			return work(tx, form, tenantId);
		});
	}
}

/** Sign-ups not confirmed within seven days are deleted, with their link. */
export async function expireSignUps(db: Db, now: Date) {
	const expired = await db
		.selectFrom('auth.oneTimeTokens')
		.select(['tenantId', 'newsletterRequestId'])
		.where('purpose', '=', 'newsletter_optin')
		.where('expiresAt', '<=', now)
		.where('newsletterRequestId', 'is not', null)
		.execute();
	for (const row of expired)
		await inScope(db, { tenantId: row.tenantId!, userId: null }, (tx) =>
			tx.deleteFrom('newsletterRequests').where('id', '=', row.newsletterRequestId!).execute(),
		);
	return expired.length;
}

/** `<workspace in base32>-<random>`: the page finds its workspace from the token alone. */
function formToken(tenantId: string) {
	return `${uuidToBase32(tenantId)}-${randomLocalPart(12)}`;
}

function tenantOfFormToken(token: string) {
	const match = new RegExp(`^(${base32Uuid})-[a-z0-9]{12}$`).exec(token);
	return match ? uuidFromBase32(match[1]) : null;
}

async function tenantName(tx: Tx) {
	return (await tx.selectFrom('tenants').select('name').executeTakeFirstOrThrow()).name;
}

/** The contact with this address, given the form's tags, or a new one. */
async function contactWithTags(
	tx: Tx,
	tenantId: string,
	request: { firstName: string; lastName: string; email: string; tags: string[] },
	now: Date,
): Promise<string> {
	const existing = await tx
		.selectFrom('contacts')
		.select(['id', 'tags'])
		.where((eb) => eb(eb.fn('lower', ['email']), '=', request.email))
		.orderBy('createdAt')
		.executeTakeFirst();
	if (existing) {
		const tags = [...new Set([...(existing.tags as string[]), ...request.tags])];
		await tx
			.updateTable('contacts')
			.set((eb) => ({ tags: JSON.stringify(tags) as never, revision: eb('revision', '+', 1), updatedAt: now }))
			.where('id', '=', existing.id)
			.execute();
		return String(existing.id);
	}
	const id = uuid();
	await tx
		.insertInto('contacts')
		.values({
			id,
			tenantId,
			kind: 'person',
			firstName: request.firstName,
			lastName: request.lastName,
			email: request.email,
			tags: sql`${JSON.stringify(request.tags)}::jsonb`,
			createdAt: now,
			updatedAt: now,
		} as never)
		.execute();
	return id;
}
