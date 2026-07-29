import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CentralErrorHandler } from '../src/error-handler.ts';

describe('CentralErrorHandler', () => {
	it('extracts error kind from metadata and localizes message', () => {
		const mockTranslator = {
			t: (key: string, fallback?: string) => {
				if (key === 'error.invalid_credentials') return 'Ungültige Anmeldedaten';
				return fallback || key;
			},
		};

		const handler = new CentralErrorHandler(mockTranslator);

		const mockConnectError = {
			message: 'Invalid credentials provided',
			meta: {
				get: (header: string) => (header === 'Clinks-Error-Kind' ? 'invalid_credentials' : null),
			},
		};

		const detail = handler.extractError(mockConnectError);
		assert.equal(detail.kind, 'invalid_credentials');
		assert.equal(detail.message, 'Ungültige Anmeldedaten');
	});

	it('falls back to raw message when translation is missing', () => {
		const handler = new CentralErrorHandler();

		const errorObj = {
			message: 'Tenant not found',
			kind: 'tenant_not_found',
		};

		const detail = handler.extractError(errorObj);
		assert.equal(detail.kind, 'tenant_not_found');
		assert.equal(detail.message, 'Tenant not found');
	});
});
