import { z } from 'zod';
import { checkoutRequest } from '../services/billing.ts';
import { body, json, route, type RouteDeps, type Router } from './helpers.ts';

export function registerBillingRoutes(app: Router, me: Router, { billing }: RouteDeps) {
	app.post('/webhooks/stripe', async (c) => {
		await billing.webhook(await c.req.text(), c.req.header('Stripe-Signature') ?? '');
		return c.body(null, 204);
	});

	me.openapi(
		route(
			{
				method: 'post',
				path: '/billing/checkout',
				tags: ['billing'],
				request: body(checkoutRequest),
				responses: { 200: json(z.object({ url: z.url() })) },
			},
			true,
		),
		async (c) => c.json(await billing.open(c.var.claims, c.req.valid('json')), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/billing/portal',
				tags: ['billing'],
				responses: { 200: json(z.object({ url: z.url() })) },
			},
			true,
		),
		async (c) => c.json(await billing.open(c.var.claims), 200),
	);
}
