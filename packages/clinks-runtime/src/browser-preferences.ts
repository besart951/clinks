export type ThemeMode = 'light' | 'dark' | 'system';

const localeKey = 'clinks-locale';
const themeKey = 'clinks-theme';

export class BrowserPreferences {
	loadLocale(): string | undefined {
		if (!this.isBrowser()) return undefined;
		return window.localStorage.getItem(localeKey) ?? undefined;
	}

	saveLocale(locale: string) {
		if (this.isBrowser()) window.localStorage.setItem(localeKey, locale);
	}

	loadTheme(): ThemeMode | undefined {
		if (!this.isBrowser()) return undefined;
		const value = window.localStorage.getItem(themeKey);
		return isThemeMode(value) ? value : undefined;
	}

	saveTheme(mode: ThemeMode) {
		if (this.isBrowser()) window.localStorage.setItem(themeKey, mode);
	}

	applyTheme(mode: ThemeMode) {
		if (!this.isBrowser()) return;
		const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.classList.toggle('dark', isDark);
	}

	watchSystemTheme(listener: () => void): () => void {
		if (!this.isBrowser()) return () => undefined;
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	}

	private isBrowser() {
		return typeof window !== 'undefined' && typeof document !== 'undefined';
	}
}

function isThemeMode(value: string | null): value is ThemeMode {
	return value === 'light' || value === 'dark' || value === 'system';
}
