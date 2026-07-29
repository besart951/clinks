import type { ClinksClient, TranslationInput } from '@clinks/api-client';
import type { Language } from '@clinks/i18n-types';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte';

export class LocalizationViewModel {
	managedLanguages = $state<Language[]>([]);
	translationKey = $state('');
	translationValue = $state('');
	translationScope = $state<TranslationInput['applicationScope']>('shared');

	#client: Pick<ClinksClient, 'adminLanguages' | 'saveTranslation'>;
	#messages: ErrorMessageFormatter;
	#refreshTranslations: () => Promise<void>;
	#locale: () => string;
	#onError: (message: string) => void;

	constructor(
		client: Pick<ClinksClient, 'adminLanguages' | 'saveTranslation'>,
		messages: ErrorMessageFormatter,
		refreshTranslations: () => Promise<void>,
		locale: () => string,
		onError: (message: string) => void,
	) {
		this.#client = client;
		this.#messages = messages;
		this.#refreshTranslations = refreshTranslations;
		this.#locale = locale;
		this.#onError = onError;
	}

	async load() {
		this.managedLanguages = await this.#client.adminLanguages();
	}

	async saveTranslationOverride() {
		this.#onError('');
		try {
			await this.#client.saveTranslation({
				locale: this.#locale(),
				applicationScope: this.translationScope,
				key: this.translationKey,
				value: this.translationValue,
			});
			this.translationKey = '';
			this.translationValue = '';
			await this.#refreshTranslations();
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	clear() {
		this.managedLanguages = [];
		this.translationKey = '';
		this.translationValue = '';
		this.translationScope = 'shared';
	}
}
