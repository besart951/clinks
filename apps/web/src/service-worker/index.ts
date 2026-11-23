import { self } from '$app/service-worker';
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';

const cacheName = 'clinks-shell-' + version;
const shell = new URL('index.html', self.registration.scope).href;
const urls = new Set([
	shell,
	...[...immutable, ...assets].map((file) => new URL(file.path, self.registration.scope).href),
]);
self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...urls])));
});
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter((name) => name.startsWith('clinks-shell-') && name !== cacheName)
						.map((name) => caches.delete(name)),
				),
			)
			.then(() => self.clients.claim()),
	);
});
self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const root = new URL(self.registration.scope);
	const url = new URL(request.url);
	const isShell =
		request.mode === 'navigate' && url.origin === root.origin && (url.pathname === root.pathname || url.href === shell);
	if (!isShell && !urls.has(url.href)) return;
	event.respondWith(
		caches.open(cacheName).then(async (cache) => (await cache.match(isShell ? shell : url.href)) ?? fetch(request)),
	);
});
