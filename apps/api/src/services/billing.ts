import { publicRoutes, webLink } from '@clinks/contracts/public-links';
import { inScope } from '@clinks/db/scope';
import { planCodes, coreModules } from '@clinks/domain/types';
import { planFor } from '@clinks/domain/plans';
import Stripe from 'stripe';
import { z } from 'zod';
import { ApiError, forbidden } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import type { Services } from './context.ts';
import { requirePermission } from './permissions.ts';
import { audit } from './audit.ts';
import { addRoleTemplates } from './role-templates.ts';

const price = z.string().regex(/^price_[A-Za-z0-9]+$/u);
export const priceBook = z.record(z.enum(planCodes), z.object({ monthly: price, yearly: price })).refine((book) => {
	const ids = Object.values(book).flatMap((entry) => Object.values(entry));
	return new Set(ids).size === ids.length;
});
export const checkoutRequest = z.object({ plan: z.enum(planCodes), cycle: z.enum(['monthly', 'yearly']) });
export type Billing = { stripe: Stripe; secret: string; prices: z.infer<typeof priceBook>; tax: boolean };

export class BillingService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}
	get gateway() {
		if (!this.#services.billing) throw new ApiError(503, 'error.billing.unavailable');
		return this.#services.billing;
	}
	async open(claims: AccessClaims, input?: z.infer<typeof checkoutRequest>) {
		if (!claims.tenant_id) throw forbidden();
		const tenantId = claims.tenant_id;
		const returnUrl = webLink(this.#services.config.WEB_ORIGIN, publicRoutes.billing());
		const initial = await inScope(this.#services.db, { tenantId, userId: claims.sub }, async (tx) => {
			await requirePermission(tx, tenantId, claims.sub, 'billing.manage');
			const account = await tx
				.selectFrom('billingAccounts')
				.select('customerId')
				.where('tenantId', '=', tenantId)
				.executeTakeFirst();
			const seats = input
				? await tx
						.selectFrom('memberships')
						.select((eb) => eb.fn.countAll().as('count'))
						.where('tenantId', '=', tenantId)
						.where('status', '=', 'active')
						.executeTakeFirstOrThrow()
				: null;
			return { customerId: account?.customerId ?? null, seats: seats ? Number(seats.count) : 0 };
		});
		const { stripe, prices, tax } = this.gateway;
		let customer = initial.customerId;
		if (!customer) {
			const created = await stripe.customers.create(
				{ metadata: { clinks_tenant: tenantId } },
				{ idempotencyKey: 'clinks-customer-' + tenantId },
			);
			customer = await inScope(this.#services.db, { tenantId, userId: null }, async (tx) => {
				await tx
					.insertInto('billingAccounts')
					.values({ tenantId, customerId: created.id })
					.onConflict((c) => c.column('tenantId').doNothing())
					.execute();
				return (
					await tx
						.selectFrom('billingAccounts')
						.select('customerId')
						.where('tenantId', '=', tenantId)
						.executeTakeFirstOrThrow()
				).customerId;
			});
		}
		const subscriptions = input ? await stripe.subscriptions.list({ customer, status: 'all', limit: 100 }) : null;
		if (!input || subscriptions?.data.some((s) => !['canceled', 'incomplete_expired'].includes(s.status))) {
			const portal = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
			return { url: portal.url };
		}
		const selected = prices[input.plan][input.cycle];
		const existing = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 1 });
		const pending = existing.data[0];
		if (pending?.url && pending.metadata?.price === selected) return { url: pending.url };
		if (pending) await stripe.checkout.sessions.expire(pending.id);
		const checkout = await stripe.checkout.sessions.create({
			mode: 'subscription',
			currency: 'chf',
			customer,
			client_reference_id: tenantId,
			metadata: { price: selected },
			line_items: [{ price: selected, quantity: initial.seats }],
			automatic_tax: { enabled: tax },
			billing_address_collection: 'required',
			customer_update: { address: 'auto' },
			success_url: returnUrl,
			cancel_url: returnUrl,
		});
		if (!checkout.url) throw new ApiError(502, 'error.billing.unavailable');
		return { url: checkout.url };
	}
	async webhook(raw: string, signature: string) {
		const { stripe, secret, prices } = this.gateway;
		let event: Stripe.Event;
		try {
			event = stripe.webhooks.constructEvent(raw, signature, secret);
		} catch {
			throw new ApiError(400, 'error.validation');
		}
		if (
			!['checkout.session.completed', 'invoice.payment_failed'].includes(event.type) &&
			!event.type.startsWith('customer.subscription.')
		)
			return;
		const object = event.data.object as { customer?: unknown };
		if (typeof object.customer !== 'string') return;
		const customer = await stripe.customers.retrieve(object.customer);
		if (customer.deleted) return;
		const tenant = z.uuid().safeParse(customer.metadata.clinks_tenant);
		if (!tenant.success) return;
		const tenantId = tenant.data;
		await inScope(this.#services.db, { tenantId, userId: null }, async (tx) => {
			const account = await tx
				.selectFrom('billingAccounts')
				.selectAll()
				.where('tenantId', '=', tenantId)
				.where('customerId', '=', customer.id)
				.forUpdate()
				.executeTakeFirst();
			if (!account) return;
			const fresh = await tx
				.insertInto('billingEvents')
				.values({ id: event.id, tenantId })
				.onConflict((c) => c.doNothing())
				.returning('id')
				.executeTakeFirst();
			if (!fresh) return;
			// Reading the current subscription under the tenant lock also handles unordered webhook delivery.
			const list = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 });
			const current = list.data.find((sub) => ['active', 'trialing'].includes(sub.status));
			const item = current?.items.data.find((item) =>
				Object.values(prices).some((pair) => Object.values(pair).includes(item.price.id)),
			);
			if (current && !item) throw new ApiError(503, 'error.billing.unavailable');
			const code = planCodes.find((code) => item && Object.values(prices[code]).includes(item.price.id)) ?? 'starter';
			if (
				item &&
				(item.price.currency !== 'chf' ||
					item.price.recurring?.interval !== (prices[code].yearly === item.price.id ? 'year' : 'month'))
			)
				throw new ApiError(503, 'error.billing.unavailable');
			const status = current?.status ?? list.data[0]?.status ?? 'new';
			await tx.updateTable('billingAccounts').set({ status }).where('tenantId', '=', tenantId).execute();
			await tx
				.updateTable('tenants')
				.set((tx) => ({
					plan: code,
					billingCycle: prices[code].yearly === item?.price.id ? 'yearly' : 'monthly',
					trialEndsAt: null,
					enabledModules: current ? [...planFor(code).modules] : [...coreModules],
					updatedAt: this.#services.now(),
					revision: tx('revision', '+', 1),
				}))
				.where('id', '=', tenantId)
				.execute();
			await addRoleTemplates(tx, tenantId);
			await audit(
				tx,
				{ tenantId, actorId: null, action: 'billing.subscription', target: tenantId, meta: { status } },
				null,
			);
		});
	}
}
