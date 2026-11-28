import type { SignInResponse } from '@clinks/contracts/auth';
import { encodeBase32UpperCaseNoPadding } from '@oslojs/encoding';
import { createTOTPKeyURI, verifyHOTP } from '@oslojs/otp';
import { sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import { hashSecret, recoveryCode, sameBytes, uuid } from '../crypto.ts';
import { ApiError, invalidCredentials } from '../errors.ts';
import { translate } from '../i18n.ts';
import { hashPassword, unknownUserHash, verifyPassword } from '../passwords.ts';
import { enforceRateLimit } from '../rate-limit.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { consumeCode, findLink, issueCode, issueLink, openChallenge, useUp } from './one-time.ts';
import type { OpenedSession, SessionService } from './sessions.ts';

/** Like the API's sign-in response, but with the refresh token the route still has to deliver. */
export type SignInResult =
	Exclude<SignInResponse, { status: 'authenticated' }> | { status: 'authenticated'; session: OpenedSession };

const lockAfter = 5;
const lockFor = 15 * 60_000;
const recoveryCodeCount = 10;

/** Sign-up, sign-in with optional TOTP, email verification, password reset and two-factor setup. */
export class AuthService {
	readonly #services: Services;
	readonly #sessions: SessionService;

	constructor(services: Services, sessions: SessionService) {
		this.#services = services;
		this.#sessions = sessions;
	}

	async signUp(input: { firstName: string; lastName: string; email: string; password: string }, caller: Caller) {
		this.#limit(`sign-up:${caller.ip}`, 10);
		const { db } = this.#services;
		const existing = await db.selectFrom('users').select('id').where('email', '=', input.email).executeTakeFirst();
		if (existing) throw new ApiError(409, 'error.email_taken', { email: 'error.email_taken' });
		const userId = uuid();
		const passwordHash = await hashPassword(input.password);
		await db.transaction().execute(async (tx) => {
			await tx
				.insertInto('users')
				.values({
					id: userId,
					email: input.email,
					firstName: input.firstName,
					lastName: input.lastName,
					locale: caller.locale,
					globalRole: null,
					emailVerifiedAt: null,
				})
				.execute();
			await tx
				.insertInto('auth.credentials')
				.values({ userId, passwordHash, totpSecret: null, totpEnabledAt: null, lockedUntil: null })
				.execute();
		});
		await audit(db, { action: 'auth.sign_up', actorId: userId }, caller);
		return { verificationId: await this.#sendVerification(userId, input.email, caller.locale) };
	}

	async signIn(input: { email: string; password: string }, caller: Caller): Promise<SignInResult> {
		this.#limit(`sign-in:ip:${caller.ip}`, 30);
		this.#limit(`sign-in:email:${input.email}`, 10);
		const { db, now } = this.#services;
		const account = await db
			.selectFrom('users')
			.innerJoin('auth.credentials', 'auth.credentials.userId', 'users.id')
			.select([
				'users.id',
				'users.email',
				'users.locale',
				'users.emailVerifiedAt',
				'passwordHash',
				'totpEnabledAt',
				'lockedUntil',
			])
			.where('users.email', '=', input.email)
			.executeTakeFirst();
		if (!account) {
			await verifyPassword(unknownUserHash, input.password);
			throw invalidCredentials();
		}
		if (account.lockedUntil && account.lockedUntil > now()) throw new ApiError(423, 'error.account_locked');
		if (!(await verifyPassword(account.passwordHash, input.password))) {
			await this.#countFailure(account.id, caller);
			throw invalidCredentials();
		}
		await db
			.updateTable('auth.credentials')
			.set({ failedAttempts: 0, lockedUntil: null })
			.where('userId', '=', account.id)
			.execute();
		if (!account.emailVerifiedAt)
			return {
				status: 'verify_email',
				verificationId: await this.#sendVerification(account.id, account.email, caller.locale),
			};
		if (account.totpEnabledAt) {
			const challenge = await issueCode(db, { purpose: 'two_factor', userId: account.id, now: now() });
			return { status: 'two_factor', challengeId: challenge.id };
		}
		return this.#signedIn(account.id, caller);
	}

	async confirmTwoFactor(input: { challengeId: string; code: string }, caller: Caller): Promise<OpenedSession> {
		this.#limit(`two-factor:ip:${caller.ip}`, 20);
		const challenge = await openChallenge(this.#services.db, input.challengeId, this.#services.now());
		if (!(await this.#checkSecondFactor(challenge.userId, input.code)))
			throw new ApiError(400, 'error.ws.invalid_code');
		await challenge.close();
		const opened = await this.#sessions.open(challenge.userId, caller);
		await audit(
			this.#services.db,
			{ action: 'auth.sign_in', actorId: challenge.userId, meta: { twoFactor: true } },
			caller,
		);
		return opened;
	}

	async verifyEmail(input: { verificationId: string; code: string }, caller: Caller): Promise<OpenedSession> {
		const { db, now } = this.#services;
		const row = await consumeCode(db, input.verificationId, 'verify_email', input.code, now());
		if (!row?.userId) throw new ApiError(400, 'error.ws.invalid_code');
		await db
			.updateTable('users')
			.set({ emailVerifiedAt: now(), updatedAt: now() })
			.where('id', '=', row.userId)
			.execute();
		return (await this.#signedIn(row.userId, caller)).session;
	}

	/** A fresh code for the same sign-up; the old verification id stops working. */
	async resendVerification(verificationId: string, caller: Caller) {
		this.#limit(`verify:ip:${caller.ip}`, 10);
		const { db, now } = this.#services;
		const current = now();
		const row = await db
			.selectFrom('auth.oneTimeTokens')
			.innerJoin('users', 'users.id', 'auth.oneTimeTokens.userId')
			.select(['users.id', 'users.email', 'users.emailVerifiedAt', 'auth.oneTimeTokens.usedAt'])
			.where('auth.oneTimeTokens.id', '=', verificationId)
			.where('purpose', '=', 'verify_email')
			.executeTakeFirst();
		if (!row || row.usedAt || row.emailVerifiedAt) throw new ApiError(400, 'error.ws.invalid_code');
		this.#limit(`verify:user:${row.id}`, 3);
		if (!(await useUp(db, verificationId, current))) throw new ApiError(400, 'error.ws.invalid_code');
		return { verificationId: await this.#sendVerification(row.id, row.email, caller.locale) };
	}

	/** Answers the same whether the address exists or not. */
	async requestPasswordReset(email: string, caller: Caller) {
		this.#limit(`reset:ip:${caller.ip}`, 10);
		this.#limit(`reset:email:${email}`, 3);
		const { db, now, mailer, config } = this.#services;
		const user = await db.selectFrom('users').select(['id', 'locale']).where('email', '=', email).executeTakeFirst();
		if (!user) return;
		const { token } = await issueLink(db, { purpose: 'reset_password', userId: user.id, now: now() });
		const locale = user.locale === 'en-US' ? 'en-US' : 'de-CH';
		await mailer.send({
			to: email,
			subject: translate(locale, 'mail.reset_password.subject'),
			text: translate(locale, 'mail.reset_password.body', {
				link: `${config.WEB_ORIGIN}/#/forgot-password?token=${encodeURIComponent(token)}`,
			}),
		});
		await audit(db, { action: 'auth.password_reset_requested', actorId: user.id }, caller);
	}

	/** The link proves the mailbox, so it also verifies the address and lifts a lock. */
	async resetPassword(input: { token: string; password: string }, caller: Caller) {
		const { db, now } = this.#services;
		const link = await findLink(db, 'reset_password', input.token, now());
		if (!link?.userId) throw new ApiError(400, 'error.reset_link_invalid');
		const userId = link.userId;
		const passwordHash = await hashPassword(input.password);
		await db.transaction().execute(async (tx) => {
			const current = now();
			if (!(await useUp(tx, link.id, current))) throw new ApiError(400, 'error.reset_link_invalid');
			await tx
				.updateTable('auth.credentials')
				.set({ passwordHash, passwordChangedAt: current, failedAttempts: 0, lockedUntil: null })
				.where('userId', '=', userId)
				.execute();
			await tx
				.updateTable('users')
				.set((eb) => ({ emailVerifiedAt: eb.fn.coalesce('emailVerifiedAt', eb.val(current)) }))
				.where('id', '=', userId)
				.execute();
			await this.#sessions.revokeAll(userId, null, tx);
			await audit(tx, { action: 'auth.password_reset', actorId: userId }, caller);
		});
	}

	async changePassword(claims: AccessClaims, input: { currentPassword: string; newPassword: string }, caller: Caller) {
		this.#limit(`password:${claims.sub}`, 5);
		const { db, now } = this.#services;
		const credentials = await this.#credentials(claims.sub);
		if (!(await verifyPassword(credentials.passwordHash, input.currentPassword)))
			throw new ApiError(400, 'error.ws.wrong_password', { currentPassword: 'error.ws.wrong_password' });
		const passwordHash = await hashPassword(input.newPassword);
		await db.transaction().execute(async (tx) => {
			await tx
				.updateTable('auth.credentials')
				.set({ passwordHash, passwordChangedAt: now() })
				.where('userId', '=', claims.sub)
				.execute();
			await this.#sessions.revokeAll(claims.sub, claims.sid, tx);
			await audit(tx, { action: 'auth.password_changed', actorId: claims.sub }, caller);
		});
	}

	/** Stores a new encrypted secret that becomes active once a code from it is confirmed. */
	async setUpTwoFactor(claims: AccessClaims) {
		const credentials = await this.#credentials(claims.sub);
		if (credentials.totpEnabledAt) throw new ApiError(409, 'error.two_factor_enabled');
		const secret = randomBytes(20);
		const sealed = await this.#sealTotpSecret(claims.sub, secret);
		await this.#services.db
			.updateTable('auth.credentials')
			.set({ totpSecret: sealed, totpLastStep: null })
			.where('userId', '=', claims.sub)
			.execute();
		const user = await this.#services.db
			.selectFrom('users')
			.select('email')
			.where('id', '=', claims.sub)
			.executeTakeFirstOrThrow();
		return {
			secret: encodeBase32UpperCaseNoPadding(secret),
			otpauthUri: createTOTPKeyURI('CLinks', user.email, secret, 30, 6),
		};
	}

	async enableTwoFactor(claims: AccessClaims, code: string, caller: Caller) {
		this.#limit(`two-factor:enable:${claims.sub}`, 10);
		const credentials = await this.#credentials(claims.sub);
		if (!credentials.totpSecret || credentials.totpEnabledAt)
			throw new ApiError(400, 'error.ws.invalid_code', { code: 'error.ws.invalid_code' });
		const secret = await this.#decodeTotpSecret(claims.sub, credentials.totpSecret);
		const current = this.#services.now();
		const step = matchingTotpStep(secret, code, current);
		if (step === null) throw new ApiError(400, 'error.ws.invalid_code', { code: 'error.ws.invalid_code' });
		const codes = Array.from({ length: recoveryCodeCount }, recoveryCode);
		await this.#services.db.transaction().execute(async (tx) => {
			await tx
				.updateTable('auth.credentials')
				.set({ totpEnabledAt: current, totpLastStep: String(step) })
				.where('userId', '=', claims.sub)
				.execute();
			await tx.deleteFrom('auth.recoveryCodes').where('userId', '=', claims.sub).execute();
			await tx
				.insertInto('auth.recoveryCodes')
				.values(codes.map((value) => ({ id: uuid(), userId: claims.sub, codeHash: hashSecret(value), usedAt: null })))
				.execute();
			await audit(tx, { action: 'auth.two_factor_enabled', actorId: claims.sub }, caller);
		});
		return { recoveryCodes: codes };
	}

	async disableTwoFactor(claims: AccessClaims, input: { code: string; password: string }, caller: Caller) {
		this.#limit(`two-factor:disable:${claims.sub}`, 5);
		const credentials = await this.#credentials(claims.sub);
		if (!(await verifyPassword(credentials.passwordHash, input.password)))
			throw new ApiError(400, 'error.ws.wrong_password', { password: 'error.ws.wrong_password' });
		if (!(await this.#checkSecondFactor(claims.sub, input.code)))
			throw new ApiError(400, 'error.ws.invalid_code', { code: 'error.ws.invalid_code' });
		await this.#services.db.transaction().execute(async (tx) => {
			await tx
				.updateTable('auth.credentials')
				.set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null })
				.where('userId', '=', claims.sub)
				.execute();
			await tx.deleteFrom('auth.recoveryCodes').where('userId', '=', claims.sub).execute();
			await audit(tx, { action: 'auth.two_factor_disabled', actorId: claims.sub }, caller);
		});
	}

	async #signedIn(userId: string, caller: Caller): Promise<SignInResult & { status: 'authenticated' }> {
		const session = await this.#sessions.open(userId, caller);
		await audit(this.#services.db, { action: 'auth.sign_in', actorId: userId }, caller);
		return { status: 'authenticated', session };
	}

	async #sendVerification(userId: string, email: string, locale: Caller['locale']) {
		const { id, code } = await issueCode(this.#services.db, {
			purpose: 'verify_email',
			userId,
			now: this.#services.now(),
		});
		await this.#services.mailer.send({
			to: email,
			subject: translate(locale, 'mail.verify_email.subject'),
			text: translate(locale, 'mail.verify_email.body', { code }),
		});
		return id;
	}

	/** A TOTP code (accepted at most once per 30s step), or an unused recovery code (consumed once). */
	async #checkSecondFactor(userId: string, code: string): Promise<boolean> {
		const credentials = await this.#credentials(userId);
		if (!credentials.totpSecret || !credentials.totpEnabledAt) return false;
		const trimmed = code.trim();
		if (/^[0-9]{6}$/.test(trimmed)) {
			const secret = await this.#decodeTotpSecret(userId, credentials.totpSecret);
			const step = matchingTotpStep(secret, trimmed, this.#services.now());
			if (step === null) return false;
			const claimed = await this.#services.db
				.updateTable('auth.credentials')
				.set({ totpLastStep: String(step) })
				.where('userId', '=', userId)
				.where((eb) => eb.or([eb('totpLastStep', 'is', null), eb('totpLastStep', '<', String(step))]))
				.executeTakeFirst();
			return claimed.numUpdatedRows === 1n;
		}
		const hash = hashSecret(trimmed.toLowerCase());
		const recovery = await this.#services.db
			.selectFrom('auth.recoveryCodes')
			.select(['id', 'codeHash'])
			.where('userId', '=', userId)
			.where('usedAt', 'is', null)
			.execute();
		const match = recovery.find((row) => sameBytes(row.codeHash, hash));
		if (!match) return false;
		const spent = await this.#services.db
			.updateTable('auth.recoveryCodes')
			.set({ usedAt: this.#services.now() })
			.where('id', '=', match.id)
			.where('usedAt', 'is', null)
			.executeTakeFirst();
		return spent.numUpdatedRows === 1n;
	}

	async #countFailure(userId: string, caller: Caller) {
		const now = this.#services.now();
		const lockUntil = new Date(now.getTime() + lockFor);
		const updated = await this.#services.db
			.updateTable('auth.credentials')
			.set({
				failedAttempts: sql<number>`CASE WHEN failed_attempts + 1 >= ${lockAfter} THEN 0 ELSE failed_attempts + 1 END`,
				lockedUntil: sql<Date | null>`CASE WHEN failed_attempts + 1 >= ${lockAfter} THEN ${lockUntil.toISOString()}::timestamptz ELSE locked_until END`,
			})
			.where('userId', '=', userId)
			.returning('lockedUntil')
			.executeTakeFirst();
		const locked = updated?.lockedUntil != null && updated.lockedUntil.getTime() >= lockUntil.getTime();
		await audit(this.#services.db, { action: locked ? 'auth.locked' : 'auth.sign_in_failed', actorId: userId }, caller);
	}

	async #sealTotpSecret(userId: string, secret: Uint8Array): Promise<Buffer> {
		const sealed = await this.#services.secrets.seal(Buffer.from(secret).toString('base64'), `totp:${userId}`);
		return Buffer.from(sealed, 'utf8');
	}

	async #decodeTotpSecret(userId: string, raw: Uint8Array): Promise<Uint8Array> {
		// Unsealed 20-byte rows created before encryption at rest remain readable until re-enrolled.
		if (raw.length === 20) return raw;
		const base64 = await this.#services.secrets.open(Buffer.from(raw).toString('utf8'), `totp:${userId}`);
		return Buffer.from(base64, 'base64');
	}

	async #credentials(userId: string) {
		return this.#services.db
			.selectFrom('auth.credentials')
			.selectAll()
			.where('userId', '=', userId)
			.executeTakeFirstOrThrow();
	}

	#limit(key: string, limit: number) {
		enforceRateLimit(this.#services.limiter, key, limit);
	}
}

function matchingTotpStep(secret: Uint8Array, code: string, now: Date): number | null {
	const trimmed = code.trim();
	const current = Math.floor(now.getTime() / 30_000);
	for (const step of [current - 1, current, current + 1]) {
		if (step >= 0 && verifyHOTP(secret, BigInt(step), 6, trimmed)) return step;
	}
	return null;
}
