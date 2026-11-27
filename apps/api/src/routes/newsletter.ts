import * as newsletter from '@clinks/contracts/newsletter';
import { z } from 'zod';
import { body, json, route, type RouteDeps, type Router } from './helpers.ts';

const params = z.object({ id: z.uuid() });
const tokenParams = z.object({ token: z.string().min(10).max(200) });
const done = { 204: { description: 'Done' } };

/** Newsletter: sign-up forms, consents, the campaign workflow, and the public pages behind the links. */
export function registerNewsletterRoutes(
	app: Router,
	me: Router,
	{ newsletterForms, newsletterSignUp, newsletterConsents, campaigns, unsubscribe, services, caller }: RouteDeps,
) {
	me.openapi(
		route(
			{
				method: 'get',
				path: '/mail/newsletter-forms',
				tags: ['newsletter'],
				responses: { 200: json(z.array(newsletter.newsletterFormDto)) },
			},
			true,
		),
		async (c) => c.json(await newsletterForms.list(c.var.claims), 200),
	);

	for (const [path, status] of [
		['/mail/newsletter-forms', 201],
		['/mail/newsletter-forms/{id}', 200],
	] as const)
		me.openapi(
			route(
				{
					method: 'post',
					path,
					tags: ['newsletter'],
					request: { ...(status === 200 ? { params } : {}), ...body(newsletter.newsletterFormInput) },
					responses: { [status]: json(newsletter.newsletterFormDto) },
				},
				true,
			),
			async (c) => {
				const id = (c.req.param() as { id?: string }).id ?? null;
				return c.json(await newsletterForms.save(c.var.claims, id, c.req.valid('json'), caller(c)), status);
			},
		);

	me.openapi(
		route(
			{
				method: 'delete',
				path: '/mail/newsletter-forms/{id}',
				tags: ['newsletter'],
				request: { params },
				responses: done,
			},
			true,
		),
		async (c) => {
			await newsletterForms.remove(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/contacts/{id}/newsletter',
				tags: ['newsletter'],
				request: { params },
				responses: { 200: json(z.array(newsletter.consentDto)) },
			},
			true,
		),
		async (c) => c.json(await newsletterConsents.history(c.var.claims, c.req.valid('param').id), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/contacts/{id}/newsletter',
				tags: ['newsletter'],
				request: { params, ...body(newsletter.consentInput) },
				responses: done,
			},
			true,
		),
		async (c) => {
			await newsletterConsents.record(c.var.claims, c.req.valid('param').id, c.req.valid('json'));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/newsletter-consents/import',
				tags: ['newsletter'],
				request: body(newsletter.consentImportInput),
				responses: { 200: json(newsletter.consentImportResult) },
			},
			true,
		),
		async (c) => c.json(await newsletterConsents.import(c.var.claims, c.req.valid('json')), 200),
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/mail/campaigns/{id}/audience',
				tags: ['newsletter'],
				request: { params },
				responses: { 200: json(newsletter.audienceDto) },
			},
			true,
		),
		async (c) => c.json(await campaigns.audience(c.var.claims, c.req.valid('param').id), 200),
	);

	for (const step of ['review', 'withdraw', 'approve'] as const)
		me.openapi(
			route(
				{
					method: 'post',
					path: `/mail/campaigns/{id}/${step}`,
					tags: ['newsletter'],
					request: { params },
					responses: done,
				},
				true,
			),
			async (c) => {
				await campaigns[step](c.var.claims, c.req.valid('param').id, caller(c));
				return c.body(null, 204);
			},
		);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/campaigns/{id}/schedule',
				tags: ['newsletter'],
				request: { params, ...body(newsletter.scheduleInput) },
				responses: done,
			},
			true,
		),
		async (c) => {
			await campaigns.schedule(c.var.claims, c.req.valid('param').id, c.req.valid('json').at, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{ method: 'post', path: '/mail/campaigns/{id}/test', tags: ['newsletter'], request: { params }, responses: done },
			true,
		),
		async (c) => {
			await campaigns.test(c.var.claims, c.req.valid('param').id);
			return c.body(null, 204);
		},
	);

	// Public: the sign-up form, its confirmation link and the unsubscribe link. No account; the tokens are the key.
	app.openapi(
		route({
			method: 'get',
			path: '/newsletter/forms/{token}',
			tags: ['newsletter'],
			request: { params: tokenParams },
			responses: { 200: json(newsletter.publicFormDto) },
		}),
		async (c) => c.json(await newsletterSignUp.form(c.req.valid('param').token), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/newsletter/forms/{token}',
			tags: ['newsletter'],
			request: { params: tokenParams, ...body(newsletter.signUpInput) },
			responses: { 202: { description: 'Confirmation mail queued (or quietly dropped)' } },
		}),
		async (c) => {
			await newsletterSignUp.signUp(c.req.valid('param').token, c.req.valid('json'), caller(c));
			return c.body(null, 202);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/newsletter/confirm/{token}',
			tags: ['newsletter'],
			request: { params: tokenParams },
			responses: { 200: json(newsletter.confirmedDto) },
		}),
		async (c) => {
			c.header('Cache-Control', 'no-store');
			return c.json(await newsletterSignUp.confirm(c.req.valid('param').token, caller(c)), 200);
		},
	);

	app.openapi(
		route({
			method: 'get',
			path: '/newsletter/unsubscribe/{token}',
			tags: ['newsletter'],
			request: { params: tokenParams },
			responses: { 200: json(newsletter.unsubscribeDto) },
		}),
		async (c) => c.json(await unsubscribe.view(c.req.valid('param').token), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/newsletter/unsubscribe/{token}/reason',
			tags: ['newsletter'],
			request: { params: tokenParams, ...body(newsletter.unsubscribeReason) },
			responses: done,
		}),
		async (c) => {
			await unsubscribe.reason(c.req.valid('param').token, c.req.valid('json').reason, caller(c));
			return c.body(null, 204);
		},
	);

	// The link in `List-Unsubscribe`. Mail apps POST `List-Unsubscribe=One-Click` (RFC 8058); a browser opening it
	// is sent to the page, which asks before unsubscribing (link scanners must not unsubscribe anyone).
	app.openapi(
		route({
			method: 'post',
			path: '/mail/unsubscribe/{token}',
			tags: ['newsletter'],
			request: { params: tokenParams },
			responses: done,
		}),
		async (c) => {
			await unsubscribe.unsubscribe(c.req.valid('param').token, caller(c));
			return c.body(null, 204);
		},
	);

	app.openapi(
		route({
			method: 'get',
			path: '/mail/unsubscribe/{token}',
			tags: ['newsletter'],
			request: { params: tokenParams },
			responses: { 302: { description: 'To the unsubscribe page' } },
		}),
		(c) =>
			c.redirect(`${services.config.WEB_ORIGIN}/#/unsubscribe/${encodeURIComponent(c.req.valid('param').token)}`, 302),
	);
}
