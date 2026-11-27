import { updated } from '$app/state';
import type { OfflineFiles, SharedInbox, FileStore, Notifier, Platform, Updater } from './types.ts';
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
	permission() {
		return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
	},
	async request() {
		if (typeof Notification === 'undefined') return false;
		return (await Notification.requestPermission()) === 'granted';
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

/** The service worker puts shared files here (service-worker/index.ts, `share-target`). */
const sharedCache = 'clinks-shared-files';
const offlineCache = 'clinks-offline-files';
const offlineKey = (key: string) => `/offline/${encodeURIComponent(key)}`;

const browserInbox: SharedInbox = {
	async take() {
		if (typeof caches === 'undefined') return [];
		const cache = await caches.open(sharedCache);
		const files: File[] = [];
		for (const request of await cache.keys()) {
			const response = await cache.match(request);
			if (response) {
				const name = decodeURIComponent(response.headers.get('x-file-name') ?? 'Datei');
				files.push(new File([await response.blob()], name, { type: response.headers.get('content-type') ?? '' }));
			}
			await cache.delete(request);
		}
		return files;
	},
};

const browserOffline: OfflineFiles = {
	async get(key) {
		if (typeof caches === 'undefined') return null;
		const response = await (await caches.open(offlineCache)).match(offlineKey(key));
		return response ? response.blob() : null;
	},
	async put(key, content) {
		if (typeof caches === 'undefined') return;
		await (await caches.open(offlineCache)).put(offlineKey(key), new Response(content));
	},
	async keys() {
		if (typeof caches === 'undefined') return [];
		const requests = await (await caches.open(offlineCache)).keys();
		return requests.map((request) => decodeURIComponent(new URL(request.url).pathname.replace('/offline/', '')));
	},
	async remove(key) {
		if (typeof caches === 'undefined') return;
		await (await caches.open(offlineCache)).delete(offlineKey(key));
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
		inbox: browserInbox,
		offline: browserOffline,
	};
}
