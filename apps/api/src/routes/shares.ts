import { z } from 'zod';
import * as documents from '@clinks/contracts/documents';
import { body, json, route, type RouteDeps, type Router } from './helpers.ts';

/** «Teilen-Link»: made and ended in the workspace; opened by the recipient without an account. */
export function registerShareRoutes(app: Router, me: Router, { documentShares, caller }: RouteDeps) {
	const documentParams = z.object({ doc: z.uuid() });
	const shareParams = z.object({ id: z.uuid() });
	const tokenParams = z.object({ token: z.string().min(20).max(200) });

	me.openapi(
		route(
			{
				method: 'get',
				path: '/documents/{doc}/shares',
				tags: ['files'],
				request: { params: documentParams },
				responses: { 200: json(z.array(documents.documentShareDto)) },
			},
			true,
		),
		async (c) => c.json(await documentShares.list(c.var.claims, c.req.valid('param').doc), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/documents/{doc}/shares',
				tags: ['files'],
				request: { params: documentParams, ...body(documents.documentShareInput) },
				responses: { 201: json(documents.documentShareCreated) },
			},
			true,
		),
		async (c) =>
			c.json(
				await documentShares.create(c.var.claims, c.req.valid('param').doc, c.req.valid('json').days, caller(c)),
				201,
			),
	);

	me.openapi(
		route(
			{
				method: 'delete',
				path: '/document-shares/{id}',
				tags: ['files'],
				request: { params: shareParams },
				responses: { 204: { description: 'Ended' } },
			},
			true,
		),
		async (c) => {
			await documentShares.revoke(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	app.openapi(
		route({
			method: 'get',
			path: '/shares/{token}',
			tags: ['files'],
			request: { params: tokenParams },
			responses: { 200: json(documents.sharedFileDetails) },
		}),
		async (c) => {
			c.header('Cache-Control', 'no-store');
			return c.json(await documentShares.details(c.req.valid('param').token), 200);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/shares/{token}',
			tags: ['files'],
			request: { params: tokenParams },
			responses: { 200: json(documents.sharedFile) },
		}),
		async (c) => {
			c.header('Cache-Control', 'no-store');
			return c.json(await documentShares.open(c.req.valid('param').token, caller(c)), 200);
		},
	);
}
