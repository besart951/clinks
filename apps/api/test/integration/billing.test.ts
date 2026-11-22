import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { startApi, type Api } from './harness.ts';

describe('Stripe tenant subscriptions', () => {
	const secret = 'local-signature-fixture';
	const stripe = new Stripe('sk_test_offline_fixture');
	const prices = {
		starter: { monthly: 'price_sm', yearly: 'price_sy' },
		team: { monthly: 'price_tm', yearly: 'price_ty' },
		business: { monthly: 'price_bm', yearly: 'price_by' },
	};
	let api: Api;
	beforeAll(async () => {
		api = await startApi({ stripe, secret, prices, tax: false });
	});
	afterAll(async () => {
		vi.restoreAllMocks();
		await api?.stop();
	});
	it('verifies signatures, binds the customer to the tenant and reconciles replayed events once', async () => {
		const owner = await api.administrator('billing@example.ch', 'Billing');
		let subscriptions: Stripe.Subscription[] = [];
		vi.spyOn(stripe.customers, 'create').mockResolvedValue({ id: 'cus_billing' } as never);
		vi.spyOn(stripe.customers, 'retrieve').mockResolvedValue({
			id: 'cus_billing',
			metadata: { clinks_tenant: owner.tenantId },
		} as never);
		vi.spyOn(stripe.subscriptions, 'list').mockImplementation((() =>
			Promise.resolve({ data: subscriptions })) as never);
		vi.spyOn(stripe.checkout.sessions, 'list').mockResolvedValue({ data: [] } as never);
		const create = vi
			.spyOn(stripe.checkout.sessions, 'create')
			.mockResolvedValue({ url: 'https://checkout.stripe.test/local' } as never);
		const checkout = await owner.browser.call('POST', '/billing/checkout', {
			token: owner.token,
			body: { plan: 'team', cycle: 'yearly' },
		});
		assert.equal(checkout.status, 200);
		assert.deepEqual(create.mock.calls[0][0]?.line_items, [{ price: 'price_ty', quantity: 1 }]);
		subscriptions = [
			{
				status: 'active',
				items: { data: [{ price: { id: 'price_ty', currency: 'chf', recurring: { interval: 'year' } } }] },
			} as Stripe.Subscription,
		];
		const raw = JSON.stringify({
			id: 'evt_signed',
			type: 'customer.subscription.updated',
			data: { object: { customer: 'cus_billing' } },
		});
		const post = (body: string, signature: string) =>
			api.app.request('/webhooks/stripe', { method: 'POST', body, headers: { 'Stripe-Signature': signature } });
		const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret });
		assert.equal((await post(raw + ' ', signature)).status, 400);
		for (const result of await Promise.all([post(raw, signature), post(raw, signature)]))
			assert.equal(result.status, 204);
		assert.equal((await api.owner.selectFrom('billingEvents').selectAll().execute()).length, 1);
		const tenant = () =>
			api.owner.selectFrom('tenants').selectAll().where('id', '=', owner.tenantId).executeTakeFirstOrThrow();
		assert.equal((await tenant()).plan, 'team');
		assert.equal((await tenant()).billingCycle, 'yearly');
		assert.ok((await tenant()).enabledModules.includes('finance'));
		subscriptions = [];
		const cancel = raw.replace('evt_signed', 'evt_closed').replace('subscription.updated', 'subscription.deleted');
		assert.equal(
			(await post(cancel, stripe.webhooks.generateTestHeaderString({ payload: cancel, secret }))).status,
			204,
		);
		assert.ok(!(await tenant()).enabledModules.includes('finance'));
	});
});
