import * as contract from '@clinks/contracts/auth';
import { z } from 'zod';
import { body, empty, json, route, type RouteDeps, type Router } from './helpers.ts';

export function registerAccountRoutes(app: Router, me: Router, deps: RouteDeps) {
	const { auth, sessions, tenants, settings, storage, caller, deliver, claims } = deps;

	me.openapi(
		route({ method: 'get', path: '/me', tags: ['account'], responses: { 200: json(contract.meResponse) } }, true),
		async (c) => c.json(await tenants.me(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/tenant',
				tags: ['account'],
				request: body(contract.switchTenantRequest),
				responses: { 200: json(contract.sessionResponse) },
			},
			true,
		),
		async (c) => c.json(await sessions.switchTenant(c.var.claims, c.req.valid('json').tenantId), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/password',
				tags: ['account'],
				request: body(contract.changePasswordRequest),
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await auth.changePassword(c.var.claims, c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/two-factor/setup',
				tags: ['account'],
				responses: { 200: json(contract.twoFactorSetupResponse) },
			},
			true,
		),
		async (c) => c.json(await auth.setUpTwoFactor(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/two-factor/enable',
				tags: ['account'],
				request: body(contract.twoFactorCodeRequest),
				responses: { 200: json(contract.recoveryCodesResponse) },
			},
			true,
		),
		async (c) => c.json(await auth.enableTwoFactor(c.var.claims, c.req.valid('json').code, caller(c)), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/two-factor/disable',
				tags: ['account'],
				request: body(contract.disableTwoFactorRequest),
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await auth.disableTwoFactor(c.var.claims, c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/me/sessions',
				tags: ['account'],
				responses: { 200: json(z.array(contract.deviceSessionDto)) },
			},
			true,
		),
		async (c) => c.json(await sessions.list(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'delete',
				path: '/me/sessions/{id}',
				tags: ['account'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await sessions.revokeFamily(c.var.claims.sub, c.req.valid('param').id);
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenants',
				tags: ['tenants'],
				request: body(contract.createTenantRequest),
				responses: { 201: json(z.object({ tenantId: z.uuid() })) },
			},
			true,
		),
		async (c) => c.json(await tenants.create(c.var.claims, c.req.valid('json'), caller(c)), 201),
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/tenant/invitations',
				tags: ['tenants'],
				responses: { 200: json(z.array(contract.invitationDto)) },
			},
			true,
		),
		async (c) => c.json(await tenants.invitations(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/invitations',
				tags: ['tenants'],
				request: body(contract.inviteRequest),
				responses: { 201: json(contract.invitationDto) },
			},
			true,
		),
		async (c) => c.json(await tenants.invite(c.var.claims, c.req.valid('json'), caller(c)), 201),
	);

	me.openapi(
		route(
			{
				method: 'delete',
				path: '/tenant/invitations/{id}',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await tenants.revokeInvitation(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/invitations/{id}/resend',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await tenants.resend(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{ method: 'get', path: '/tenant/team', tags: ['tenants'], responses: { 200: json(contract.teamResponse) } },
			true,
		),
		async (c) => c.json(await settings.team(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/roles',
				tags: ['tenants'],
				request: body(contract.roleUpdate),
				responses: { 200: json(z.object({ id: z.uuid() })) },
			},
			true,
		),
		async (c) => c.json(await settings.saveRole(c.var.claims, c.req.valid('json'), caller(c)), 200),
	);

	me.openapi(
		route(
			{
				method: 'delete',
				path: '/tenant/roles/{id}',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.role(c.var.claims, c.req.valid('param').id, undefined, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/roles/{id}/reset',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.resetRole(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/members/{id}',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }), ...body(contract.memberUpdate) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.member(c.var.claims, c.req.valid('param').id, c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/members/{id}/sign-out',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.signOut(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/settings',
				tags: ['tenants'],
				request: body(contract.companyUpdate),
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.company(c.var.claims, c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/tenant/storage',
				tags: ['tenants'],
				responses: { 200: json(contract.storageView.nullable()) },
			},
			true,
		),
		async (c) => c.json(await storage.get(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/storage',
				tags: ['tenants'],
				request: body(contract.storageInput),
				responses: { 200: json(contract.storageView.nullable()) },
			},
			true,
		),
		async (c) => c.json(await storage.save(c.var.claims, c.req.valid('json'), caller(c)), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/storage/test',
				tags: ['tenants'],
				responses: { 200: json(contract.storageCheck) },
			},
			true,
		),
		async (c) => c.json(await storage.test(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/profile',
				tags: ['account'],
				request: body(contract.profileUpdate),
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.profile(c.var.claims, c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	const invitationToken = z.object({ token: z.string().min(20).max(200) });

	app.openapi(
		route({
			method: 'get',
			path: '/invitations/{token}',
			tags: ['tenants'],
			request: { params: invitationToken },
			responses: { 200: json(contract.invitationDetailsResponse) },
		}),
		async (c) => c.json(await tenants.invitationDetails(c.req.valid('param').token), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/invitations/{token}/accept',
			tags: ['tenants'],
			request: { params: invitationToken, ...body(contract.acceptInvitationRequest) },
			responses: { 200: json(contract.acceptInvitationResponse) },
		}),
		async (c) => {
			const result = await tenants.acceptInvitation(
				c.req.valid('param').token,
				c.req.valid('json'),
				await claims(c),
				caller(c),
			);
			return c.json(
				{ tenantId: result.tenantId, session: result.session ? deliver(c, result.session) : undefined },
				200,
			);
		},
	);
}
