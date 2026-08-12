import { Code } from '@connectrpc/connect';
import type { Locale, LocalizedError } from '@clinks/i18n-types';

export class APIError extends Error implements LocalizedError {
	code: string;
	locale: Locale;
	connectCode?: Code;

	constructor(error: LocalizedError, connectCode?: Code) {
		super(error.message);
		this.name = 'APIError';
		this.code = error.code;
		this.locale = error.locale;
		this.connectCode = connectCode;
	}
}

export function isUnauthenticatedError(error: unknown): boolean {
	return error instanceof APIError && error.connectCode === Code.Unauthenticated;
}
