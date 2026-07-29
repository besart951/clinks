import type { ThemeMode } from './browser-preferences';
import { BrowserPreferences } from './browser-preferences';

export class ThemeViewModel {
	mode = $state<ThemeMode>('system');
	#stopWatching: () => void = () => undefined;
	#preferences: BrowserPreferences;

	constructor(preferences: BrowserPreferences) {
		this.#preferences = preferences;
	}

	initialize() {
		this.mode = this.#preferences.loadTheme() ?? 'system';
		this.apply();
		this.#stopWatching = this.#preferences.watchSystemTheme(() => {
			if (this.mode === 'system') this.apply();
		});
	}

	dispose() {
		this.#stopWatching();
	}

	setMode(mode: ThemeMode) {
		this.mode = mode;
		this.#preferences.saveTheme(mode);
		this.apply();
	}

	private apply() {
		this.#preferences.applyTheme(this.mode);
	}
}
