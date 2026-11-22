import type { CalendarDate, Rappen, Timestamp } from '@clinks/domain/types';
import { fromCalendarDate } from '@clinks/domain/dates';
import type { Preferences } from '../platform/types.ts';
import { bundleFor, defaultLocale, interpolate, locales, type Locale } from './catalog.ts';

export type TranslationParams = { [name: string]: string | number };

const storageKey = 'clinks.workspace.locale';

/** Translates catalog keys and formats dates, times and CHF amounts for the active language. */
export class Translator {
	locale = $state<Locale>(defaultLocale);
	#bundle = $derived(bundleFor(this.locale));
	#money = $derived(new Intl.NumberFormat(this.locale, { style: 'currency', currency: 'CHF' }));
	#number = $derived(new Intl.NumberFormat(this.locale));
	#date = $derived(new Intl.DateTimeFormat(this.locale, { day: '2-digit', month: '2-digit', year: 'numeric' }));
	#time = $derived(new Intl.DateTimeFormat(this.locale, { hour: '2-digit', minute: '2-digit' }));
	#relative = $derived(new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' }));

	#preferences: Preferences;

	constructor(preferences: Preferences) {
		this.#preferences = preferences;
		const stored = preferences.read<string>(storageKey, defaultLocale);
		this.locale = locales.includes(stored as Locale) ? (stored as Locale) : defaultLocale;
	}

	setLocale(locale: Locale) {
		this.locale = locale;
		document.documentElement.lang = locale;
		this.#preferences.write(storageKey, locale);
	}

	t(key: string, params?: TranslationParams): string {
		const template = this.#bundle.get(key);
		return template === undefined ? key : interpolate(template, params);
	}

	has(key: string) {
		return this.#bundle.has(key);
	}

	money(amount: Rappen): string {
		return this.#money.format(amount / 100);
	}

	number(value: number): string {
		return this.#number.format(value);
	}

	percent(basisPoints: number): string {
		return `${this.#number.format(basisPoints / 100)} %`;
	}

	date(value: CalendarDate | Timestamp): string {
		return this.#date.format(value.length === 10 ? fromCalendarDate(value) : new Date(value));
	}

	time(value: Timestamp): string {
		return this.#time.format(new Date(value));
	}

	dateTime(value: Timestamp): string {
		return `${this.date(value)} ${this.time(value)}`;
	}

	format(value: Date | CalendarDate, options: Intl.DateTimeFormatOptions): string {
		const date = typeof value === 'string' ? fromCalendarDate(value) : value;
		return new Intl.DateTimeFormat(this.locale, options).format(date);
	}

	relative(value: Timestamp, now: Date = new Date()): string {
		const seconds = (new Date(value).getTime() - now.getTime()) / 1000;
		const units: [Intl.RelativeTimeFormatUnit, number][] = [
			['day', 86_400],
			['hour', 3_600],
			['minute', 60],
		];
		for (const [unit, size] of units) {
			if (Math.abs(seconds) >= size) return this.#relative.format(Math.round(seconds / size), unit);
		}
		return this.#relative.format(0, 'minute');
	}
}
