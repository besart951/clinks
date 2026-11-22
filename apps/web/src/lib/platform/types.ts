/**
 * Everything the app needs from its host. The web build implements it with browser APIs (web.svelte.ts);
 * a Tauri build implements the same interfaces with native plugins, a Flutter port mirrors them. Screens and
 * models never touch localStorage, window or files directly.
 */
export interface Platform {
	preferences: Preferences;
	secure: SecureStorage;
	files: FileStore;
	notifier: Notifier;
	updater: Updater;
}

/** Small, non-secret settings such as theme, language and open sections. Synchronous for the first render. */
export interface Preferences {
	read<T>(key: string, fallback: T): T;
	write(key: string, value: unknown): void;
	remove(key: string): void;
}

/**
 * Session and credential data. The web stores it in localStorage; Tauri in the operating system's keychain,
 * loaded into memory before the app mounts so reads stay synchronous.
 */
export interface SecureStorage {
	read(key: string): string | null;
	write(key: string, value: string): void;
	remove(key: string): void;
}

export interface FileStore {
	readAsDataUrl(file: File): Promise<string>;
	/** Hands a generated file to the user: a download on the web, a save dialog on desktop. */
	save(content: Blob, filename: string): void;
	/** Opens a document or link outside the app. */
	open(url: string): void;
	print(): void;
}

export interface Notifier {
	/** Shows a system notification when the user allowed it; returns whether one was shown. */
	notify(title: string, body: string): boolean;
}

export interface Updater {
	/** A newer version of the app has been deployed. */
	readonly available: boolean;
	apply(): void;
}
