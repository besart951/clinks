import type { ClinksClient } from '@clinks/api-client';
import { APIError } from '@clinks/api-client/errors';
import {
	productDefaultLocale,
	productDefaultTranslations,
	type Language,
	type Locale,
	type ProductTranslationKey,
} from '@clinks/i18n-types';
import { BrowserPreferences } from './browser-preferences.ts';

export type TranslationKey = ProductTranslationKey | (string & {});

export class TranslationBundleViewModel {
	locale = $state<Locale>(productDefaultLocale);
	languages = $state<Language[]>([]);
	isLoading = $state(false);
	translations = $state.raw<Record<string, string>>({ ...productDefaultTranslations });
	#request = 0;
	#prepared = false;
	#initialization: Promise<void> | null = null;

	#client: Pick<ClinksClient, 'languages' | 'translations'>;
	#preferences: BrowserPreferences;

	constructor(client: Pick<ClinksClient, 'languages' | 'translations'>, preferences: BrowserPreferences) {
		this.#client = client;
		this.#preferences = preferences;
	}

	prepare() {
		if (this.#prepared) return;
		this.#prepared = true;
		this.locale = this.#preferences.loadLocale() ?? productDefaultLocale;
	}

	initialize() {
		this.prepare();
		if (this.#initialization) return this.#initialization;
		this.#initialization = Promise.all([this.loadLanguages(), this.refresh()]).then(() => undefined);
		return this.#initialization;
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
		} catch {
			// Keep the source-controlled default catalog so public pages remain usable offline.
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
