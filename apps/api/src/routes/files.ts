import { z } from 'zod';
import { versionUpload } from '../services/files.ts';
import { body, json, route, type RouteDeps, type Router } from './helpers.ts';

export function registerFileRoutes(me: Router, { files, caller }: RouteDeps) {
	const documentParams = z.object({ doc: z.uuid() });
	const versionParams = documentParams.extend({ id: z.uuid() });
	const versions = '/documents/{doc}/versions';

	me.openapi(
		route(
			{
				method: 'get',
				path: versions,
				tags: ['files'],
				request: { params: documentParams },
				responses: {
					200: json(
						z.array(z.object({ id: z.uuid(), size: z.int(), mimeType: z.string(), createdAt: z.iso.datetime() })),
					),
				},
			},
			true,
		),
		async (c) =>
			c.json(
				(await files.list(c.var.claims, c.req.valid('param').doc)).map((row) => ({
					...row,
					createdAt: row.createdAt.toISOString(),
				})),
				200,
			),
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: versions + '/{id}/download',
				tags: ['files'],
				request: { params: versionParams },
				responses: { 200: json(z.object({ url: z.url() })) },
			},
			true,
		),
		async (c) => {
			const { doc, id } = c.req.valid('param');
			c.header('Cache-Control', 'no-store');
			return c.json(await files.download(c.var.claims, doc, id), 200);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: versions + '/upload',
				tags: ['files'],
				request: { params: documentParams, ...body(versionUpload) },
				responses: { 200: json(z.object({ id: z.uuid(), url: z.url() })) },
			},
			true,
		),
		async (c) => c.json(await files.upload(c.var.claims, c.req.valid('param').doc, c.req.valid('json')), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: versions + '/{id}/commit',
				tags: ['files'],
				request: { params: versionParams, ...body(z.object({ restoreFrom: z.uuid().optional() })) },
				responses: { 200: json(z.object({ id: z.uuid() })) },
			},
			true,
		),
		async (c) => {
			const { doc, id } = c.req.valid('param');
			return c.json(await files.commit(c.var.claims, doc, id, c.req.valid('json').restoreFrom, caller(c)), 200);
		},
	);
}
