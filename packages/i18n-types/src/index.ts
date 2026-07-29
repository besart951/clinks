export { productDefaultLocale, productTranslationKeys } from './product-translation-key.generated.ts';
export type { ProductTranslationKey } from './product-translation-key.generated.ts';

export type Locale = string;

export interface Language {
	code: Locale;
	name: string;
	isDefault: boolean;
	isActive: boolean;
}

export interface TranslationResponse {
	locale: Locale;
	translations: Record<string, string>;
}

export interface LocalizedError {
	code: string;
	message: string;
	locale: Locale;
}
