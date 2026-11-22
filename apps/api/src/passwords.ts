import { hash, verify } from '@node-rs/argon2';

/** argon2id with the OWASP baseline (19 MiB, 2 passes). */
const options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
	return hash(password, options);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
	try {
		return await verify(stored, password);
	} catch {
		return false;
	}
}

/** Verified against when the account does not exist, so the answer takes as long either way. */
export const unknownUserHash = await hashPassword('not-a-real-password-placeholder');
