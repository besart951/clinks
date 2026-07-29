import { APIError, type ClinksClient } from '@clinks/api-client';
import { productDefaultLocale, type Language, type Locale, type ProductTranslationKey } from '@clinks/i18n-types';
import { BrowserPreferences } from './browser-preferences.ts';

export type TranslationKey = ProductTranslationKey | (string & {});

export class TranslationBundleViewModel {
	locale = $state<Locale>(productDefaultLocale);
	languages = $state<Language[]>([]);
	isLoading = $state(false);
	translations = $state<Record<string, string>>({});
	#request = 0;

	#client: Pick<ClinksClient, 'languages' | 'translations'>;
	#preferences: BrowserPreferences;

	constructor(client: Pick<ClinksClient, 'languages' | 'translations'>, preferences: BrowserPreferences) {
		this.#client = client;
		this.#preferences = preferences;
	}

	async initialize() {
		this.locale = this.#preferences.loadLocale() ?? productDefaultLocale;
		await Promise.all([this.loadLanguages(), this.refresh()]);
	}

	async setLocale(locale: Locale) {
		if (this.locale === locale) return;
		this.locale = locale;
		this.#preferences.saveLocale(locale);
		await this.refresh();
	}

	async refresh() {
		const request = ++this.#request;
		this.isLoading = true;
		try {
			const bundle = await this.#client.translations();
			if (request === this.#request) this.translations = bundle.translations;
		} finally {
			if (request === this.#request) this.isLoading = false;
		}
	}

	t(key: TranslationKey) {
		return this.translations[key] ?? key;
	}

	message(error: unknown) {
		return error instanceof APIError ? error.message : this.t('error.internal');
	}

	private async loadLanguages() {
		try {
			this.languages = await this.#client.languages();
		} catch {
			this.languages = [];
		}
	}
}
