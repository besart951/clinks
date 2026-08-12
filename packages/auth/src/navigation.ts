export function currentInternalPath(): string {
	if (typeof location === 'undefined') return '/';
	return `${location.pathname}${location.search}${location.hash}`;
}

export function withReturnTo(redirectTo: string, returnTo: string): string {
	if (!isSafeInternalPath(redirectTo) || !isSafeInternalPath(returnTo)) return redirectTo;
	const target = new URL(redirectTo, 'https://clinks.invalid');
	if (`${target.pathname}${target.search}${target.hash}` === returnTo) return redirectTo;
	target.searchParams.set('returnTo', returnTo);
	return `${target.pathname}${target.search}${target.hash}`;
}

export function returnToFromSearch(search: string, fallback: string): string {
	const returnTo = new URLSearchParams(search).get('returnTo');
	return returnTo && isSafeInternalPath(returnTo) ? returnTo : fallback;
}

export function isSafeInternalPath(value: string): boolean {
	return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\u0000-\u001f]/u.test(value);
}
