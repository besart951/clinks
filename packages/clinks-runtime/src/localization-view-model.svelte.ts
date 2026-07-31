import type { LocalizationAdminService, TranslationInput } from '@clinks/api-client';
import type { Language } from '@clinks/i18n-types';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte.ts';
import { QueryState } from './query-state.svelte.ts';

export class LocalizationViewModel {
	languages = new QueryState<Language[]>();
	translationKey = $state('');
	translationValue = $state('');
	translationScope = $state<TranslationInput['applicationScope']>('shared');
	error = $state('');
	busy = $state(false);

	#service: LocalizationAdminService;
	#messages: ErrorMessageFormatter;
	#refreshTranslations: () => Promise<void>;
	#locale: () => string;

	constructor(
		service: LocalizationAdminService,
		messages: ErrorMessageFormatter,
		refreshTranslations: () => Promise<void>,
		locale: () => string,
	) {
		this.#service = service;
		this.#messages = messages;
		this.#refreshTranslations = refreshTranslations;
		this.#locale = locale;
	}

	async load() {
		await this.languages.execute(() => this.#service.adminLanguages());
	}

	async saveTranslationOverride() {
		if (this.busy) return;
		const key = this.translationKey.trim();
		const value = this.translationValue.trim();
		if (!key || !value) return;
		this.busy = true;
		this.error = '';
		try {
			await this.#service.saveTranslation({
				locale: this.#locale(),
				applicationScope: this.translationScope,
				key,
				value,
			});
			this.translationKey = '';
			this.translationValue = '';
			await this.#refreshTranslations();
		} catch (error) {
			this.error = this.#messages.message(error);
		} finally {
			this.busy = false;
		}
	}

	clear() {
		this.languages.reset();
		this.translationKey = '';
		this.translationValue = '';
		this.translationScope = 'shared';
		this.error = '';
		this.busy = false;
	}
}
