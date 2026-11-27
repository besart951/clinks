import type { Locale } from '@clinks/i18n-types/catalog';

/**
 * How each language is offered: by its own name (people look for «Français», not «French») and the flag of
 * the country its formats follow. A new locale needs a line here and a flag in `Flag.svelte`.
 */
export const localeNames: { [locale in Locale]: { name: string; country: 'ch' | 'us' } } = {
	'de-CH': { name: 'ui.ws.locale.de_ch', country: 'ch' },
	'en-US': { name: 'ui.ws.locale.en_us', country: 'us' },
};
