import type { ProductTranslationKey } from '@clinks/i18n-types';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * A failure the caller can act on. The message is a catalog key; the error handler localizes it, so
 * screens render it verbatim. Anything else that escapes a handler becomes `error.internal`.
 */
export class ApiError extends Error {
	readonly status: ContentfulStatusCode;
	readonly key: ProductTranslationKey;
	readonly fields: { [field: string]: ProductTranslationKey };

	constructor(
		status: ContentfulStatusCode,
		key: ProductTranslationKey,
		fields: { [field: string]: ProductTranslationKey } = {},
	) {
		super(key);
		this.name = 'ApiError';
		this.status = status;
		this.key = key;
		this.fields = fields;
	}
}

export const unauthorized = () => new ApiError(401, 'error.unauthorized');
export const forbidden = () => new ApiError(403, 'error.forbidden');
export const invalidCredentials = () => new ApiError(401, 'error.invalid_credentials');
export const rateLimited = () => new ApiError(429, 'error.rate_limited');
