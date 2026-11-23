import type { ErrorResponse, SessionResponse } from '@clinks/contracts/auth';
import { MockApiError, type ErrorCode } from './database.ts';

const statusCodes: { [status: number]: ErrorCode } = {
	400: 'validation',
	401: 'unauthorized',
	403: 'unauthorized',
	404: 'not_found',
	409: 'conflict',
	410: 'validation',
	413: 'validation',
	423: 'unauthorized',
	429: 'validation',
};

/**
 * Talks to the CLinks API. The access token lives only in memory; the refresh token is an HttpOnly cookie
 * the browser sends to /auth itself, so no script on the page can read either from storage.
 */
export class ApiClient {
	readonly #baseUrl: string;
	readonly #locale: () => string;
	readonly #localize: (key: string) => string;
	#accessToken: string | null = null;
	#expiresAt = 0;
	#refreshing: Promise<boolean> | null = null;

	constructor(baseUrl: string, locale: () => string, localize: (key: string) => string) {
		this.#baseUrl = baseUrl.replace(/\/$/, '');
		this.#locale = locale;
		this.#localize = localize;
	}

	localError(key: string) {
		return new MockApiError('validation', this.#localize(key));
	}

	get signedIn(): boolean {
		return this.#accessToken !== null;
	}

	/** Errors come back as `MockApiError` with the API's localized message, like the mock API's. */
	async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
		let response = await this.#send(method, path, body);
		if (response.status === 401 && this.#accessToken && !path.startsWith('/auth/') && (await this.refresh()))
			response = await this.#send(method, path, body);
		if (!response.ok) throw await toError(response);
		return (response.status === 204 ? undefined : await response.json()) as T;
	}

	/** Keeps the session the API just opened. */
	adopt(session: SessionResponse) {
		this.#accessToken = session.accessToken;
		this.#expiresAt = new Date(session.expiresAt).getTime();
	}

	/** A valid access token for other services (PowerSync); renewed a minute before it expires. */
	async accessToken(): Promise<string | null> {
		if (this.#accessToken && this.#expiresAt - Date.now() > 60_000) return this.#accessToken;
		return (await this.refresh()) ? this.#accessToken : null;
	}

	/** A new access token from the refresh cookie; one request at a time, even if many calls hit a 401 together. */
	refresh(): Promise<boolean> {
		this.#refreshing ??= this.#send('POST', '/auth/refresh', {})
			.then(async (response) => {
				if (!response.ok) {
					this.#accessToken = null;
					if (response.status !== 401) throw await toError(response);
					return false;
				}
				this.adopt((await response.json()) as SessionResponse);
				return true;
			})
			.finally(() => (this.#refreshing = null));
		return this.#refreshing;
	}

	forget() {
		this.#accessToken = null;
		this.#expiresAt = 0;
	}

	async #send(method: string, path: string, body: unknown): Promise<Response> {
		const headers: Record<string, string> = { 'X-Clinks-Client': 'web', 'Accept-Language': this.#locale() };
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (this.#accessToken) headers.Authorization = `Bearer ${this.#accessToken}`;
		try {
			return await fetch(this.#baseUrl + path, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
				credentials: 'include',
			});
		} catch {
			throw new MockApiError('offline', this.#localize('error.ws.offline'));
		}
	}
}

async function toError(response: Response): Promise<MockApiError> {
	const parsed = (await response.json().catch(() => null)) as ErrorResponse | null;
	const code = statusCodes[response.status] ?? 'internal';
	return new MockApiError(code, parsed?.error.message ?? response.statusText, parsed?.error.fields ?? {});
}
