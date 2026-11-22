import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { newId } from '@clinks/domain/ids';

/** A UUIDv7 from the system's secure random source. */
export function uuid<T extends string = string>(): T {
	return newId<T>(Date.now(), () => randomBytes(1)[0] / 256);
}

/** An unguessable token for links and refresh tokens (256 bits, base64url). */
export function randomToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Six digits for codes sent by mail. */
export function randomCode(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Recovery codes look like `k7m2-x9qp-4hdw`: easy to type, 60 bits each. */
export function recoveryCode(): string {
	const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
	const characters = Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]);
	return [0, 4, 8].map((start) => characters.slice(start, start + 4).join('')).join('-');
}

/** Tokens and codes are stored as SHA-256 only, so a database leak exposes no usable secret. */
export function hashSecret(secret: string): Buffer {
	return createHash('sha256').update(secret).digest();
}

export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && timingSafeEqual(left, right);
}
