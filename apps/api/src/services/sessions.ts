import type { DeviceSessionDto, SessionResponse } from '@clinks/contracts/auth';
import type { Db } from '@clinks/db/client';
import { inScope, type Tx } from '@clinks/db/scope';
import { hashSecret, randomToken, uuid } from '../crypto.ts';
import { unauthorized } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import type { Caller, Services } from './context.ts';

const refreshTokenLifetime = 30 * 24 * 60 * 60_000;
/** Two tabs may refresh with the same cookie at once; a reuse this soon is not treated as theft. */
const reuseGrace = 30_000;

export interface OpenedSession extends SessionResponse {
	refreshToken: string;
	familyId: string;
}

/**
 * Signed-in devices. Each device is a family of refresh tokens: every refresh replaces the token, and
 * presenting a replaced token again (stolen and used twice) revokes the whole family.
 */
export class SessionService {
	readonly #services: Services;

	constructor(services: Services) {
		this.#services = services;
	}

	/** Signs a user in on a new device, in their preferred tenant or their first one. */
	async open(userId: string, caller: Caller, preferredTenant: string | null = null): Promise<OpenedSession> {
		const tenantId = preferredTenant ?? (await this.#firstTenant(userId));
		const familyId = uuid();
		const refreshToken = await this.#storeRefreshToken({ familyId, userId, tenantId, caller });
		return { ...(await this.#access(userId, tenantId, familyId)), refreshToken, familyId };
	}

	async refresh(refreshToken: string, caller: Caller): Promise<OpenedSession> {
		const { db, now } = this.#services;
		const current = now();
		const row = await db
			.selectFrom('auth.refreshTokens')
			.selectAll()
			.where('tokenHash', '=', hashSecret(refreshToken))
			.executeTakeFirst();
		if (!row || row.revokedAt || row.expiresAt <= current) throw unauthorized();
		if (row.replacedAt) {
			if (current.getTime() - row.replacedAt.getTime() > reuseGrace) await this.revokeFamily(row.userId, row.familyId);
			throw unauthorized();
		}
		const replaced = await db
			.updateTable('auth.refreshTokens')
			.set({ replacedAt: current })
			.where('id', '=', row.id)
			.where('replacedAt', 'is', null)
			.executeTakeFirst();
		if (replaced.numUpdatedRows === 0n) throw unauthorized();
		const tenantId = row.tenantId && (await this.#roleIn(row.userId, row.tenantId)) !== null ? row.tenantId : null;
		const next = await this.#storeRefreshToken({ familyId: row.familyId, userId: row.userId, tenantId, caller });
		return { ...(await this.#access(row.userId, tenantId, row.familyId)), refreshToken: next, familyId: row.familyId };
	}

	/** A new access token for another tenant of the same user; the device keeps its refresh token. */
	async switchTenant(claims: AccessClaims, tenantId: string): Promise<SessionResponse> {
		if ((await this.#roleIn(claims.sub, tenantId)) === null) throw unauthorized();
		await this.#services.db
			.updateTable('auth.refreshTokens')
			.set({ tenantId })
			.where('familyId', '=', claims.sid)
			.where('userId', '=', claims.sub)
			.execute();
		return this.#access(claims.sub, tenantId, claims.sid);
	}

	/** Whether the device behind an access token is still signed in. */
	async isActive(claims: AccessClaims): Promise<boolean> {
		const row = await this.#services.db
			.selectFrom('auth.refreshTokens')
			.select('id')
			.where('familyId', '=', claims.sid)
			.where('userId', '=', claims.sub)
			.where('revokedAt', 'is', null)
			.where('expiresAt', '>', this.#services.now())
			.executeTakeFirst();
		return row !== undefined;
	}

	async list(claims: AccessClaims): Promise<DeviceSessionDto[]> {
		const rows = await this.#services.db
			.selectFrom('auth.refreshTokens')
			.select(['familyId', 'device', 'ip', 'createdAt'])
			.where('userId', '=', claims.sub)
			.where('revokedAt', 'is', null)
			.where('replacedAt', 'is', null)
			.where('expiresAt', '>', this.#services.now())
			.orderBy('createdAt', 'desc')
			.execute();
		return rows.map((row) => ({
			id: row.familyId,
			device: row.device,
			ip: row.ip,
			lastActiveAt: row.createdAt.toISOString(),
			current: row.familyId === claims.sid,
		}));
	}

	async revokeFamily(userId: string, familyId: string) {
		await this.#services.db
			.updateTable('auth.refreshTokens')
			.set({ revokedAt: this.#services.now() })
			.where('familyId', '=', familyId)
			.where('userId', '=', userId)
			.where('revokedAt', 'is', null)
			.execute();
	}

	async revokeByToken(refreshToken: string) {
		const row = await this.#services.db
			.selectFrom('auth.refreshTokens')
			.select(['userId', 'familyId'])
			.where('tokenHash', '=', hashSecret(refreshToken))
			.executeTakeFirst();
		if (row) await this.revokeFamily(row.userId, row.familyId);
	}

	/** After a password change or reset: every device signs in again, except the one that changed it. */
	async revokeAll(userId: string, except: string | null = null, tx?: Tx) {
		let query = (tx ?? this.#services.db)
			.updateTable('auth.refreshTokens')
			.set({ revokedAt: this.#services.now() })
			.where('userId', '=', userId)
			.where('revokedAt', 'is', null);
		if (except) query = query.where('familyId', '!=', except);
		await query.execute();
	}

	async #access(userId: string, tenantId: string | null, familyId: string): Promise<SessionResponse> {
		const role = tenantId ? await this.#roleIn(userId, tenantId) : null;
		const { token, expiresAt } = await this.#services.tokens.issue(
			{ sub: userId, tenant_id: role ? tenantId : null, role, sid: familyId },
			this.#services.now(),
		);
		return { accessToken: token, expiresAt: expiresAt.toISOString() };
	}

	async #storeRefreshToken(input: { familyId: string; userId: string; tenantId: string | null; caller: Caller }) {
		const token = randomToken();
		await this.#services.db
			.insertInto('auth.refreshTokens')
			.values({
				id: uuid(),
				familyId: input.familyId,
				userId: input.userId,
				tenantId: input.tenantId,
				tokenHash: hashSecret(token),
				device: input.caller.device,
				ip: input.caller.ip,
				expiresAt: new Date(this.#services.now().getTime() + refreshTokenLifetime),
				replacedAt: null,
				revokedAt: null,
			})
			.execute();
		return token;
	}

	/** The role id of an active membership, or null. */
	async #roleIn(userId: string, tenantId: string): Promise<string | null> {
		const row = await inScope(this.#services.db, { tenantId, userId }, (tx) =>
			tx
				.selectFrom('memberships')
				.select('roleId')
				.where('tenantId', '=', tenantId)
				.where('userId', '=', userId)
				.where('status', '=', 'active')
				.executeTakeFirst(),
		);
		return row?.roleId ?? null;
	}

	async #firstTenant(userId: string): Promise<string | null> {
		const row = await inScope(this.#services.db, { tenantId: null, userId }, (tx) =>
			tx
				.selectFrom('memberships')
				.select('tenantId')
				.where('userId', '=', userId)
				.where('status', '=', 'active')
				.orderBy('createdAt')
				.executeTakeFirst(),
		);
		return row?.tenantId ?? null;
	}
}

export async function pruneExpiredTokens(db: Db, now: Date): Promise<{ refreshTokens: number; oneTimeTokens: number }> {
	const [refresh, oneTime] = await Promise.all([
		db.deleteFrom('auth.refreshTokens').where('expiresAt', '<=', now).executeTakeFirst(),
		db.deleteFrom('auth.oneTimeTokens').where('expiresAt', '<=', now).executeTakeFirst(),
	]);
	return { refreshTokens: Number(refresh.numDeletedRows), oneTimeTokens: Number(oneTime.numDeletedRows) };
}
