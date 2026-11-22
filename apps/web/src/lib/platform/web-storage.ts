import type { Preferences, SecureStorage } from './types.ts';

/** The part of the Web Storage API the implementations need; tests pass an in-memory fake. */
export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** JSON values in Web Storage. Storage may be missing or full (private mode): reads fall back, writes are dropped. */
export class StoragePreferences implements Preferences {
	#storage: KeyValueStorage | null;

	constructor(storage: KeyValueStorage | null) {
		this.#storage = storage;
	}

	read<T>(key: string, fallback: T): T {
		try {
			const raw = this.#storage?.getItem(key);
			return raw === null || raw === undefined ? fallback : (JSON.parse(raw) as T);
		} catch {
			return fallback;
		}
	}

	write(key: string, value: unknown) {
		try {
			this.#storage?.setItem(key, JSON.stringify(value));
		} catch {
			// The setting applies to this visit only.
		}
	}

	remove(key: string) {
		try {
			this.#storage?.removeItem(key);
		} catch {
			// Nothing to remove.
		}
	}
}

/**
 * Raw strings in Web Storage, for the mock session only. Any script on the page can read Web Storage,
 * so real tokens never go here: phase 2 keeps the session in an HttpOnly cookie and native builds use
 * the OS keychain.
 */
export class StorageSecrets implements SecureStorage {
	#storage: KeyValueStorage | null;

	constructor(storage: KeyValueStorage | null) {
		this.#storage = storage;
	}

	read(key: string): string | null {
		try {
			return this.#storage?.getItem(key) ?? null;
		} catch {
			return null;
		}
	}

	write(key: string, value: string) {
		try {
			this.#storage?.setItem(key, value);
		} catch {
			// The value lasts until the page is reloaded.
		}
	}

	remove(key: string) {
		try {
			this.#storage?.removeItem(key);
		} catch {
			// Nothing to remove.
		}
	}
}

/** localStorage when it is usable; null in private modes that throw on access. */
export function browserStorage(): KeyValueStorage | null {
	try {
		const probe = 'clinks.workspace.probe';
		localStorage.setItem(probe, '1');
		localStorage.removeItem(probe);
		return localStorage;
	} catch {
		return null;
	}
}
