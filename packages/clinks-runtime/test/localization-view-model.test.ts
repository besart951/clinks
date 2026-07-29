import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;

import { LocalizationViewModel } from '../src/localization-view-model.svelte.ts';

describe('LocalizationViewModel', () => {
	it('loads managed languages', async () => {
		const mockClient = {
			adminLanguages: async () => [{ code: 'de-CH', name: 'German (Swiss)', isDefault: true }],
			saveTranslation: async () => undefined,
		};
		let refreshed = false;
		const model = new LocalizationViewModel(
			mockClient,
			{ message: (e) => String(e) },
			async () => {
				refreshed = true;
			},
			() => 'de-CH',
			() => undefined,
		);

		await model.load();
		assert.equal(model.managedLanguages.length, 1);
		assert.equal(model.managedLanguages[0].code, 'de-CH');
	});

	it('saves translation override and clears inputs', async () => {
		let savedInput: unknown = null;
		let refreshed = false;
		const mockClient = {
			adminLanguages: async () => [],
			saveTranslation: async (input: unknown) => {
				savedInput = input;
			},
		};
		const model = new LocalizationViewModel(
			mockClient,
			{ message: (e) => String(e) },
			async () => {
				refreshed = true;
			},
			() => 'de-CH',
			() => undefined,
		);

		model.translationKey = 'ui.welcome';
		model.translationValue = 'Willkommen';
		await model.saveTranslationOverride();

		assert.equal(model.translationKey, '');
		assert.equal(model.translationValue, '');
		assert.equal(refreshed, true);
		assert.deepEqual(savedInput, {
			locale: 'de-CH',
			applicationScope: 'shared',
			key: 'ui.welcome',
			value: 'Willkommen',
		});
	});
});
