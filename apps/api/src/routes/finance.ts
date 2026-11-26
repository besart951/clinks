import * as finance from '@clinks/contracts/finance';
import { z } from 'zod';
import { json, route, type RouteDeps, type Router } from './helpers.ts';

export function registerFinanceRoutes(app: Router, me: Router, { invoices, caller }: RouteDeps) {
	const params = z.object({ id: z.uuid() });
	const link = z.object({ token: z.string().min(16).max(200) });

	me.openapi(
		route(
			{
				method: 'get',
				path: '/finance/invoices/{id}/pdf',
				tags: ['finance'],
				request: { params },
				responses: { 200: json(z.object({ url: z.string() })) },
			},
			true,
		),
		async (c) => {
			c.header('Cache-Control', 'no-store');
			return c.json(await invoices.pdf(c.var.claims, c.req.valid('param').id), 200);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/finance/invoices/{id}/send',
				tags: ['finance'],
				request: { params, body: { content: { 'application/json': { schema: finance.invoiceSendInput } } } },
				responses: { 201: json(finance.invoiceSendDto) },
			},
			true,
		),
		async (c) =>
			c.json(await invoices.send(c.var.claims, c.req.valid('param').id, c.req.valid('json'), caller(c)), 201),
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/finance/invoices/{id}/sends',
				tags: ['finance'],
				request: { params },
				responses: { 200: json(z.array(finance.invoiceSendDto)) },
			},
			true,
		),
		async (c) => c.json(await invoices.sends(c.var.claims, c.req.valid('param').id), 200),
	);

	// The recipient's side of a secure link: no account, the token and the postcode of the billing address.
	app.openapi(
		route({
			method: 'get',
			path: '/invoice-links/{token}',
			tags: ['finance'],
			request: { params: link },
			responses: { 200: json(finance.invoiceLinkDetails) },
		}),
		async (c) => {
			c.header('Cache-Control', 'no-store');
			return c.json(await invoices.linkDetails(c.req.valid('param').token), 200);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/invoice-links/{token}',
			tags: ['finance'],
			request: {
				params: link,
				body: { content: { 'application/json': { schema: finance.invoiceLinkOpen } } },
			},
			responses: { 200: json(finance.invoiceLinkFile) },
		}),
		async (c) => {
			c.header('Cache-Control', 'no-store');
			const { token } = c.req.valid('param');
			return c.json(await invoices.openLink(token, c.req.valid('json').postcode, caller(c)), 200);
		},
	);
}
