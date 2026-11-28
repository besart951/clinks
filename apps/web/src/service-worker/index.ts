import { publicRoutes, webLink } from '@clinks/contracts/public-links';
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
/**
 * «Teilen → CLinks» on a phone (manifest `share_target`): the shared files wait in a cache of their own until the
 * documents page takes them (platform `inbox`), then the app opens there.
 */
const sharedCache = 'clinks-shared-files';
async function receiveShare(request: Request) {
	const data = await request.formData();
	const cache = await caches.open(sharedCache);
	let index = 0;
	for (const file of data.getAll('files')) {
		if (!(file instanceof File)) continue;
		await cache.put(
			new URL(`shared/${Date.now()}-${index++}`, self.registration.scope).href,
			new Response(file, {
				headers: {
					'content-type': file.type || 'application/octet-stream',
					'x-file-name': encodeURIComponent(file.name),
				},
			}),
		);
	}
	return Response.redirect(webLink(self.registration.scope, publicRoutes.sharedDocuments()), 303);
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (
		request.method === 'POST' &&
		new URL(request.url).href === new URL('share-target', self.registration.scope).href
	) {
		event.respondWith(receiveShare(request));
		return;
	}
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
