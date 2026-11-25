import { syncImportRequest, syncWriteRequest } from '@clinks/contracts/sync';
import { z } from 'zod';
import { body, json, route, type RouteDeps, type Router } from './helpers.ts';

export function registerSyncRoutes(me: Router, { sync, caller }: RouteDeps) {
	me.openapi(
		route(
			{
				method: 'post',
				path: '/sync/write',
				tags: ['sync'],
				request: body(syncWriteRequest),
				responses: { 200: json(z.object({ applied: z.number().int() })) },
			},
			true,
		),
		async (c) => c.json(await sync.write(c.var.claims, c.req.valid('json'), caller(c)), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/sync/import',
				tags: ['sync'],
				request: body(syncImportRequest),
				responses: { 200: json(z.object({ applied: z.number().int() })) },
			},
			true,
		),
		async (c) => c.json(await sync.write(c.var.claims, c.req.valid('json'), caller(c), 'import'), 200),
	);
}
