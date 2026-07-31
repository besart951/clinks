import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;
(globalThis as any).$derived ??= (v: any) => (typeof v === 'function' ? v() : v);

import { LocalizationViewModel } from '../src/localization-view-model.svelte.ts';

describe('LocalizationViewModel', () => {
	it('loads managed languages', async () => {
		const mockService = {
			adminLanguages: async () => [{ code: 'de-CH', name: 'German (Swiss)', isDefault: true }],
			saveTranslation: async () => undefined,
		};
		let refreshed = false;
		const model = new LocalizationViewModel(
			mockService,
			{ message: (e) => String(e) },
			async () => {
				refreshed = true;
			},
			() => 'de-CH',
		);

		await model.load();
		assert.equal(model.languages.data!.length, 1);
		assert.equal(model.languages.data![0].code, 'de-CH');
	});

	it('saves translation override and clears inputs', async () => {
		let savedInput: unknown = null;
		let refreshed = false;
		const mockService = {
			adminLanguages: async () => [],
			saveTranslation: async (input: unknown) => {
				savedInput = input;
			},
		};
		const model = new LocalizationViewModel(
			mockService,
			{ message: (e) => String(e) },
			async () => {
				refreshed = true;
			},
			() => 'de-CH',
		);

		model.translationKey = 'ui.test';
		model.translationValue = 'Test';
		model.translationScope = 'shared';
		await model.saveTranslationOverride();

		assert.equal(model.translationKey, '');
		assert.equal(model.translationValue, '');
		assert.ok(refreshed);
		assert.ok(savedInput);
	});
});
