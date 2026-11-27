import { updated } from '$app/state';
import type { FileStore, Notifier, Platform, Updater } from './types.ts';
import { StoragePreferences, StorageSecrets, browserStorage } from './web-storage.ts';

const browserFiles: FileStore = {
	readAsDataUrl(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
	},
	save(content, filename) {
		const link = document.createElement('a');
		link.href = URL.createObjectURL(content);
		link.download = filename;
		link.click();
		URL.revokeObjectURL(link.href);
	},
	open(url) {
		// A mail link hands over to the mail program; a new tab would stay empty.
		if (url.startsWith('mailto:')) window.location.assign(url);
		else window.open(url, '_blank', 'noopener');
	},
	print() {
		window.print();
	},
	copyText(text) {
		return navigator.clipboard.writeText(text);
	},
};

const browserNotifier: Notifier = {
	notify(title, body) {
		// In the foreground the in-app bell is enough; never ask for permission unprompted.
		if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return false;
		new Notification(title, { body });
		return true;
	},
};

/** SvelteKit polls the deployed version (`version.pollInterval`); a reload picks up the new build. */
const browserUpdater: Updater = {
	get available() {
		return updated.current;
	},
	apply() {
		location.reload();
	},
};

export function createWebPlatform(): Platform {
	const storage = browserStorage();
	return {
		preferences: new StoragePreferences(storage),
		secure: new StorageSecrets(storage),
		files: browserFiles,
		notifier: browserNotifier,
		updater: browserUpdater,
	};
}
