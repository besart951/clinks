import { goto } from '$app/navigation';

/** The part of a URL the hash router reads; `page.url` from `$app/state` satisfies it. */
export interface RouteUrl {
	readonly hash: string;
}

/** Hash-router link for a path such as `/contacts/123`. */
export function href(path: string): string {
	return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
	return goto(href(path), options);
}

/** The route path of the hash router, e.g. `/contacts/123` for `#/contacts/123?tab=notes`. */
export function routePath(url: RouteUrl): string {
	return (url.hash.slice(1) || '/').split('?')[0];
}

/** Query parameters inside the hash, e.g. `tab=notes` for `#/contacts/123?tab=notes`. */
export function routeQuery(url: RouteUrl): URLSearchParams {
	return new URLSearchParams(url.hash.split('?')[1] ?? '');
}

/** Replaces query parameters of the current route without adding a history entry. */
export function setQuery(url: RouteUrl, changes: { [key: string]: string | null }) {
	const query = routeQuery(url);
	for (const [key, value] of Object.entries(changes)) {
		if (value === null || value === '') query.delete(key);
		else query.set(key, value);
	}
	const search = query.toString();
	return goto(href(`${routePath(url)}${search ? `?${search}` : ''}`), {
		replace: true,
		reset: false,
	});
}
