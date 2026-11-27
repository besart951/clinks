import { createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { CompactEncrypt, compactDecrypt } from 'jose';
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

/** Lower-case letters and digits for addresses that must be hard to guess, e.g. a filing address (52 bits at 10). */
export function randomLocalPart(length: number): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
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

/**
 * Encrypts small secrets (a tenant's S3 secret key) as a compact JWE (`dir` + `A256GCM`) through jose. The tenant
 * id is part of the authenticated header, so a ciphertext copied to another tenant is refused.
 */
export class SecretBox {
	readonly #key: Uint8Array;

	constructor(key: Uint8Array) {
		if (key.length !== 32) throw new Error('STORAGE_SECRET_KEY must be 32 bytes (base64)');
		this.#key = key;
	}

	static fromBase64(value: string) {
		return new SecretBox(Buffer.from(value, 'base64'));
	}

	/** A random key, for development and tests only. */
	static ephemeral() {
		return new SecretBox(randomBytes(32));
	}

	seal(plaintext: string, context: string): Promise<string> {
		return new CompactEncrypt(new TextEncoder().encode(plaintext))
			.setProtectedHeader({ alg: 'dir', enc: 'A256GCM', ctx: context })
			.encrypt(this.#key);
	}

	/** A short tag proving that CLinks made `message` (e.g. an unsubscribe link), with a key of its own per use. */
	mac(message: string, context: string): string {
		const key = Buffer.from(hkdfSync('sha256', this.#key, new Uint8Array(0), `clinks-mac:${context}`, 32));
		return createHmac('sha256', key).update(message).digest('base64url').slice(0, 22);
	}

	async open(sealed: string, context: string): Promise<string> {
		const { plaintext, protectedHeader } = await compactDecrypt(sealed, this.#key, {
			keyManagementAlgorithms: ['dir'],
			contentEncryptionAlgorithms: ['A256GCM'],
		});
		if (protectedHeader.ctx !== context) throw new Error('Secret belongs to another context');
		return new TextDecoder().decode(plaintext);
	}
}

const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
/** A pattern matching one `uuidToBase32` value. */
export const base32Uuid = '[a-z2-7]{26}';

/** A UUID as 26 lower-case base32 letters: fits mail local parts and URLs, survives lower-casing. */
export function uuidToBase32(uuidValue: string) {
	const bytes = Buffer.from(uuidValue.replace(/-/g, ''), 'hex');
	let bits = '';
	for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
	let out = '';
	for (let index = 0; index < bits.length; index += 5)
		out += alphabet[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
	return out;
}

export function uuidFromBase32(value: string) {
	let bits = '';
	for (const char of value) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
	const hex = Array.from({ length: 16 }, (_, index) =>
		parseInt(bits.slice(index * 8, index * 8 + 8), 2)
			.toString(16)
			.padStart(2, '0'),
	).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
