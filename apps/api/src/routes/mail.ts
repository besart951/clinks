import * as mail from '@clinks/contracts/mail';
import { z } from 'zod';
import { body, json, route, type RouteDeps, type Router } from './helpers.ts';

export function registerMailRoutes(
	me: Router,
	{ mailSettings, mailCompose, appointmentMail, mailExport, caller }: RouteDeps,
) {
	const params = z.object({ id: z.uuid() });
	const done = { 204: { description: 'Done' } };

	me.openapi(
		route(
			{ method: 'get', path: '/mail/settings', tags: ['mail'], responses: { 200: json(mail.mailSettingsDto) } },
			true,
		),
		async (c) => c.json(await mailSettings.settings(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/domains',
				tags: ['mail'],
				request: body(mail.mailDomainInput),
				responses: { 201: json(mail.mailDomainDto) },
			},
			true,
		),
		async (c) => c.json(await mailSettings.addDomain(c.var.claims, c.req.valid('json'), caller(c)), 201),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/domains/{id}/check',
				tags: ['mail'],
				request: { params },
				responses: { 200: json(mail.mailDomainDto) },
			},
			true,
		),
		async (c) => c.json(await mailSettings.checkDomain(c.var.claims, c.req.valid('param').id), 200),
	);

	me.openapi(
		route({ method: 'delete', path: '/mail/domains/{id}', tags: ['mail'], request: { params }, responses: done }, true),
		async (c) => {
			await mailSettings.removeDomain(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/filing-address',
				tags: ['mail'],
				responses: { 200: json(mail.mailSettingsDto) },
			},
			true,
		),
		async (c) => c.json(await mailSettings.rotateFilingAddress(c.var.claims, caller(c)), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/senders',
				tags: ['mail'],
				request: body(mail.mailSenderInput),
				responses: { 201: json(mail.mailSenderDto) },
			},
			true,
		),
		async (c) => c.json(await mailSettings.saveSender(c.var.claims, null, c.req.valid('json'), caller(c)), 201),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/senders/{id}',
				tags: ['mail'],
				request: { params, ...body(mail.mailSenderInput) },
				responses: { 200: json(mail.mailSenderDto) },
			},
			true,
		),
		async (c) =>
			c.json(await mailSettings.saveSender(c.var.claims, c.req.valid('param').id, c.req.valid('json'), caller(c)), 200),
	);

	me.openapi(
		route({ method: 'delete', path: '/mail/senders/{id}', tags: ['mail'], request: { params }, responses: done }, true),
		async (c) => {
			await mailSettings.removeSender(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{ method: 'get', path: '/mail/my-senders', tags: ['mail'], responses: { 200: json(z.array(mail.ownSenderDto)) } },
			true,
		),
		async (c) => c.json(await mailCompose.senders(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/send',
				tags: ['mail'],
				request: body(mail.mailSendInput),
				responses: { 201: json(mail.mailSendResult) },
			},
			true,
		),
		async (c) => c.json(await mailCompose.send(c.var.claims, c.req.valid('json'), caller(c)), 201),
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/mail/appointment-settings',
				tags: ['mail'],
				responses: { 200: json(mail.appointmentMailSettings) },
			},
			true,
		),
		async (c) => c.json(await appointmentMail.get(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/mail/appointment-settings',
				tags: ['mail'],
				request: body(mail.appointmentMailSettings),
				responses: done,
			},
			true,
		),
		async (c) => {
			await appointmentMail.save(c.var.claims, c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/mail/export',
				tags: ['mail'],
				responses: { 200: json(z.record(z.string(), z.array(z.unknown()))) },
			},
			true,
		),
		async (c) => c.json(await mailExport.export(c.var.claims), 200),
	);
}
