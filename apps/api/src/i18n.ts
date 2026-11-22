import { bundleFor, defaultLocale, interpolate, locales, type Locale } from '@clinks/i18n-types/catalog';
import type { ProductTranslationKey } from '@clinks/i18n-types';

const bundles = new Map(locales.map((locale) => [locale, bundleFor(locale)]));

/** The best catalog language for an Accept-Language header or a stored user locale. */
export function pickLocale(preference: string | null | undefined): Locale {
	for (const part of (preference ?? '').split(',')) {
		const tag = part.split(';')[0].trim().toLowerCase();
		const match = locales.find(
			(locale) => locale.toLowerCase() === tag || locale.slice(0, 2).toLowerCase() === tag.slice(0, 2),
		);
		if (match) return match;
	}
	return defaultLocale;
}

export function translate(
	locale: Locale,
	key: ProductTranslationKey,
	params?: { [name: string]: string | number },
): string {
	const template = bundles.get(locale)?.get(key);
	return template === undefined ? key : interpolate(template, params);
}
