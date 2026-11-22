import type { OneTimePurpose } from '@clinks/db/schema';
import type { Tx } from '@clinks/db/scope';
import type { Db } from '@clinks/db/client';
import { hashSecret, randomCode, randomToken, sameBytes, uuid } from '../crypto.ts';
import { ApiError } from '../errors.ts';

const maxAttempts = 5;

export const lifetimes: { [purpose in OneTimePurpose]: number } = {
	verify_email: 30 * 60_000,
	reset_password: 60 * 60_000,
	invitation: 72 * 60 * 60_000,
	two_factor: 5 * 60_000,
};

interface Issue {
	purpose: OneTimePurpose;
	userId?: string;
	invitationId?: string;
	tenantId?: string;
	now: Date;
}

/**
 * Codes are short, so each is hashed together with its row id (no two rows collide) and a row
 * allows five guesses. Links carry a long random token and are looked up by its hash.
 */
export async function issueCode(db: Db | Tx, issue: Issue): Promise<{ id: string; code: string }> {
	const id = uuid();
	const code = randomCode();
	await insert(db, id, codeHash(id, code), issue);
	return { id, code };
}

export async function issueLink(db: Db | Tx, issue: Issue): Promise<{ id: string; token: string }> {
	const id = uuid();
	const token = randomToken();
	await insert(db, id, hashSecret(token), issue);
	return { id, token };
}

async function insert(db: Db | Tx, id: string, tokenHash: Buffer, issue: Issue) {
	await db
		.insertInto('auth.oneTimeTokens')
		.values({
			id,
			purpose: issue.purpose,
			userId: issue.userId ?? null,
			invitationId: issue.invitationId ?? null,
			tenantId: issue.tenantId ?? null,
			tokenHash,
			expiresAt: new Date(issue.now.getTime() + lifetimes[issue.purpose]),
			usedAt: null,
		})
		.execute();
}

/** Spends one guess on the row and returns it when `code` matches; the row is then used up. */
export async function consumeCode(db: Db, id: string, purpose: OneTimePurpose, code: string, now: Date) {
	return db.transaction().execute(async (tx) => {
		const row = await tx
			.selectFrom('auth.oneTimeTokens')
			.selectAll()
			.where('id', '=', id)
			.where('purpose', '=', purpose)
			.forUpdate()
			.executeTakeFirst();
		if (!row || row.usedAt || row.attempts >= maxAttempts) throw new ApiError(400, 'error.ws.invalid_code');
		if (row.expiresAt <= now) throw new ApiError(400, 'error.code_expired');
		await tx
			.updateTable('auth.oneTimeTokens')
			.set({ attempts: row.attempts + 1 })
			.where('id', '=', id)
			.execute();
		if (!sameBytes(row.tokenHash, codeHash(id, code))) return null;
		await tx.updateTable('auth.oneTimeTokens').set({ usedAt: now }).where('id', '=', id).execute();
		return row;
	});
}

/** For two-factor challenges: the row is valid but the check (TOTP) happens elsewhere. */
export async function openChallenge(db: Db, id: string, now: Date) {
	return db.transaction().execute(async (tx) => {
		const row = await tx
			.selectFrom('auth.oneTimeTokens')
			.selectAll()
			.where('id', '=', id)
			.where('purpose', '=', 'two_factor')
			.forUpdate()
			.executeTakeFirst();
		if (!row || row.usedAt || row.attempts >= maxAttempts || !row.userId)
			throw new ApiError(400, 'error.ws.invalid_code');
		if (row.expiresAt <= now) throw new ApiError(400, 'error.code_expired');
		await tx
			.updateTable('auth.oneTimeTokens')
			.set({ attempts: row.attempts + 1 })
			.where('id', '=', id)
			.execute();
		return {
			userId: row.userId,
			close: () => db.updateTable('auth.oneTimeTokens').set({ usedAt: now }).where('id', '=', id).execute(),
		};
	});
}

/** A valid, unused link of `purpose`, or null. Does not use it up. */
export async function findLink(db: Db | Tx, purpose: OneTimePurpose, token: string, now: Date) {
	const row = await db
		.selectFrom('auth.oneTimeTokens')
		.selectAll()
		.where('tokenHash', '=', hashSecret(token))
		.where('purpose', '=', purpose)
		.executeTakeFirst();
	return row && !row.usedAt && row.expiresAt > now ? row : null;
}

export async function useUp(db: Db | Tx, id: string, now: Date) {
	await db.updateTable('auth.oneTimeTokens').set({ usedAt: now }).where('id', '=', id).execute();
}

function codeHash(id: string, code: string): Buffer {
	return hashSecret(`${id}:${code.trim()}`);
}
