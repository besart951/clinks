export function routeHash(path: string): string {
	return '#' + (path.startsWith('/') ? path : '/' + path);
}

/** Public entry points shared by email, browser, service worker and payment returns. */
export const publicRoutes = {
	passwordReset: (token: string) => '/forgot-password?token=' + encodeURIComponent(token),
	billing: () => '/settings/billing',
	documentShare: (token: string) => '/share/' + encodeURIComponent(token),
	invoice: (token: string) => '/invoice-link/' + encodeURIComponent(token),
	invitation: (token: string) => '/invitation/' + encodeURIComponent(token),
	newsletter: (token: string) => '/newsletter/' + encodeURIComponent(token),
	confirmNewsletter: (token: string) => '/newsletter/confirm/' + encodeURIComponent(token),
	unsubscribe: (token: string) => '/unsubscribe/' + encodeURIComponent(token),
	visitWeek: (week: string) => '/visits?week=' + encodeURIComponent(week),
	sharedDocuments: () => '/documents?shared=1',
};

export function webLink(base: string, route: string): string {
	const url = new URL(base);
	url.search = '';
	url.hash = routeHash(route);
	return url.href;
}

/** Mail clients POST to the API directly for one-click unsubscribe. */
export function unsubscribeEndpoint(apiOrigin: string, token: string): string {
	return new URL('/mail/unsubscribe/' + encodeURIComponent(token), apiOrigin).href;
}
