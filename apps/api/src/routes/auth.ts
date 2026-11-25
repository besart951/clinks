import * as contract from '@clinks/contracts/auth';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import {
	body,
	clearRefreshCookie,
	empty,
	json,
	presentedRefreshToken,
	refreshCookie,
	requireClientHeader,
	route,
	type RouteDeps,
	type Router,
} from './helpers.ts';

export function registerAuthRoutes(app: Router, deps: RouteDeps) {
	const { services, auth, sessions, caller, deliver, claims: claimsOf } = deps;

	app.openapi(
		route({
			method: 'get',
			path: '/health',
			tags: ['system'],
			responses: { 200: json(z.object({ status: z.literal('ok') })) },
		}),
		async (c) => {
			await services.db.selectFrom('users').select('id').limit(1).execute();
			return c.json({ status: 'ok' as const }, 200);
		},
	);

	app.openapi(
		route({
			method: 'get',
			path: '/.well-known/jwks.json',
			tags: ['system'],
			responses: { 200: json(z.object({ keys: z.array(z.record(z.string(), z.unknown())) })) },
		}),
		(c) => {
			c.header('Cache-Control', 'public, max-age=300');
			return c.json(services.tokens.jwks() as { keys: Record<string, unknown>[] }, 200);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/sign-up',
			tags: ['auth'],
			request: body(contract.signUpRequest),
			responses: { 201: json(contract.verificationResponse) },
		}),
		async (c) => c.json(await auth.signUp(c.req.valid('json'), caller(c)), 201),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/sign-in',
			tags: ['auth'],
			request: body(contract.signInRequest),
			responses: { 200: json(contract.signInResponse) },
		}),
		async (c) => {
			const result = await auth.signIn(c.req.valid('json'), caller(c));
			return c.json(
				result.status === 'authenticated' ? { status: result.status, session: deliver(c, result.session) } : result,
				200,
			);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/two-factor',
			tags: ['auth'],
			request: body(contract.twoFactorRequest),
			responses: { 200: json(contract.sessionResponse) },
		}),
		async (c) => c.json(deliver(c, await auth.confirmTwoFactor(c.req.valid('json'), caller(c))), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/verify-email',
			tags: ['auth'],
			request: body(contract.verifyEmailRequest),
			responses: { 200: json(contract.sessionResponse) },
		}),
		async (c) => c.json(deliver(c, await auth.verifyEmail(c.req.valid('json'), caller(c))), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/verify-email/resend',
			tags: ['auth'],
			request: body(contract.resendVerificationRequest),
			responses: { 200: json(contract.verificationResponse) },
		}),
		async (c) => c.json(await auth.resendVerification(c.req.valid('json').verificationId, caller(c)), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/password-reset/request',
			tags: ['auth'],
			request: body(contract.passwordResetRequest),
			responses: { 204: empty() },
		}),
		async (c) => {
			await auth.requestPasswordReset(c.req.valid('json').email, caller(c));
			return c.body(null, 204);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/password-reset',
			tags: ['auth'],
			request: body(contract.passwordResetConfirm),
			responses: { 204: empty() },
		}),
		async (c) => {
			await auth.resetPassword(c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/refresh',
			tags: ['auth'],
			request: body(contract.refreshRequest),
			responses: { 200: json(contract.sessionResponse) },
		}),
		async (c) => {
			const opened = await sessions
				.refresh(presentedRefreshToken(c, c.req.valid('json')), caller(c))
				.catch((error: unknown) => {
					clearRefreshCookie(c);
					throw error;
				});
			return c.json(deliver(c, opened), 200);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/sign-out',
			tags: ['auth'],
			request: body(contract.refreshRequest),
			responses: { 204: empty() },
		}),
		async (c) => {
			requireClientHeader(c);
			// The refresh token identifies the device even when the access token has already expired.
			const claims = await claimsOf(c);
			if (claims) await sessions.revokeFamily(claims.sub, claims.sid);
			const refreshToken = c.req.valid('json').refreshToken ?? getCookie(c, refreshCookie);
			if (refreshToken) await sessions.revokeByToken(refreshToken);
			clearRefreshCookie(c);
			return c.body(null, 204);
		},
	);
}
