import { z } from 'zod';
import { json, route, type RouteDeps, type Router } from './helpers.ts';

export function registerFinanceRoutes(me: Router, { invoices }: RouteDeps) {
	const params = z.object({ id: z.uuid() });

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
}
