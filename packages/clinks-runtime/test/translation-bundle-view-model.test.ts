import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;
(globalThis as any).$derived ??= (v: any) => (typeof v === 'function' ? v() : v);

import { TranslationBundleViewModel } from '../src/translation-bundle-view-model.svelte.ts';

describe('TranslationBundleViewModel', () => {
	it('provides strongly-typed translation lookups with fallback', async () => {
		const mockClient = {
			languages: async () => [{ code: 'de-CH', name: 'German', isDefault: true }],
			translations: async () => ({
				locale: 'de-CH',
				translations: { 'ui.welcome': 'Willkommen' },
			}),
		};

		const mockPreferences = {
			loadLocale: () => 'de-CH',
			saveLocale: () => undefined,
		};

		const model = new TranslationBundleViewModel(mockClient, mockPreferences as never);
		await model.initialize();

		assert.equal(model.t('ui.welcome'), 'Willkommen');
		assert.equal(model.t('ui.unknown_key'), 'ui.unknown_key');
	});
});
