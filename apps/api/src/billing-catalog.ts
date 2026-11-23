/** Provision the published seat prices in a Stripe sandbox and emit STRIPE_PRICES for its API deployment. */
import Stripe from 'stripe';
import { plans } from '@clinks/domain/plans';

const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith('sk_test_')) throw Error('A Stripe test secret is required');
const stripe = new Stripe(key);
const prices: Record<string, Record<string, string>> = {};
for (const plan of plans) {
	const productId = 'clinks_' + plan.code;
	try {
		await stripe.products.retrieve(productId);
	} catch (error) {
		if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.code !== 'resource_missing') throw error;
		await stripe.products.create(
			{ id: productId, name: 'CLinks ' + plan.code, metadata: { plan: plan.code } },
			{ idempotencyKey: 'product-' + productId },
		);
	}
	const pair: Record<string, string> = {};
	for (const cycle of ['monthly', 'yearly'] as const) {
		const interval = cycle === 'monthly' ? 'month' : 'year';
		const amount = plan.monthlyPricePerSeat * (cycle === 'monthly' ? 1 : 10);
		const lookupKey = [productId, cycle, 'chf', amount].join('_');
		const listed = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
		const price =
			listed.data[0] ??
			(await stripe.prices.create(
				{ product: productId, currency: 'chf', unit_amount: amount, recurring: { interval }, lookup_key: lookupKey },
				{ idempotencyKey: lookupKey },
			));
		if (
			price.product !== productId ||
			price.currency !== 'chf' ||
			price.unit_amount !== amount ||
			price.recurring?.interval !== interval
		)
			throw Error('Unexpected price for ' + lookupKey);
		pair[cycle] = price.id;
	}
	prices[plan.code] = pair;
}
console.log(JSON.stringify(prices));
