export type ThemeMode = 'light' | 'dark' | 'system';

const storageKey = 'clinks.workspace.theme';

/** Light, dark or follow the operating system; stored per browser. */
export class ThemeController {
	mode = $state<ThemeMode>('system');

	initialize(): () => void {
		try {
			this.mode = (localStorage.getItem(storageKey) as ThemeMode | null) ?? 'system';
		} catch {
			this.mode = 'system';
		}
		this.#apply();
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		const listener = () => this.mode === 'system' && this.#apply();
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	}

	setMode(mode: ThemeMode) {
		this.mode = mode;
		try {
			localStorage.setItem(storageKey, mode);
		} catch {
			// The choice applies to this visit only.
		}
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
