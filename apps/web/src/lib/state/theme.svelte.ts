import type { Preferences } from '../platform/types.ts';

export type ThemeMode = 'light' | 'dark' | 'system';

const storageKey = 'clinks.workspace.theme';

/** Light, dark or follow the operating system; stored per browser. */
export class ThemeController {
	mode = $state<ThemeMode>('system');
	#preferences: Preferences;

	constructor(preferences: Preferences) {
		this.#preferences = preferences;
	}

	initialize(): () => void {
		this.mode = this.#preferences.read<ThemeMode>(storageKey, 'system');
		this.#apply();
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		const listener = () => this.mode === 'system' && this.#apply();
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	}

	setMode(mode: ThemeMode) {
		this.mode = mode;
		this.#preferences.write(storageKey, mode);
		this.#apply();
	}

	toggle() {
		this.setMode(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
	}

	#apply() {
		const dark =
			this.mode === 'dark' || (this.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.classList.toggle('dark', dark);
	}
}
