import catalog from '../../../../../localization/product-catalog.json' with { type: 'json' };

export type Locale = 'de-CH' | 'en-US';
export const locales: readonly Locale[] = ['de-CH', 'en-US'];
export const defaultLocale: Locale = 'de-CH';

type LocalizedValues = { [locale: string]: string };
type Catalog = { defaultLocale: string; translations: { [scope: string]: { [key: string]: LocalizedValues } } };

/**
 * The prototype has no translation API, so it resolves the source-controlled product catalog itself:
 * shared texts in the default language, overlaid with the requested language, exactly as the server does.
 */
export function bundleFor(locale: Locale, source: Catalog = catalog as Catalog): Map<string, string> {
	const bundle = new Map<string, string>();
	for (const scope of ['shared']) {
		for (const [key, values] of Object.entries(source.translations[scope] ?? {})) {
			const value = values[locale] ?? values[source.defaultLocale];
			if (value) bundle.set(key, value);
		}
	}
	return bundle;
}

export function interpolate(template: string, params: { [name: string]: string | number } = {}): string {
	return template.replace(/\{([a-z_]+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
