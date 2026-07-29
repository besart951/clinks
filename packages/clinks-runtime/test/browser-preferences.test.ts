import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserPreferences } from '../src/browser-preferences.ts';

type Listener = () => void;

function createBrowserEnvironment() {
	const values = new Map<string, string>();
	let listener: Listener | undefined;
	const toggles: Array<[string, boolean]> = [];
	const media = {
		matches: false,
		addEventListener: (_: 'change', next: Listener) => (listener = next),
		removeEventListener: (_: 'change', next: Listener) => {
			if (listener === next) listener = undefined;
		},
	};

	Object.assign(globalThis, {
		window: {
			localStorage: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => values.set(key, value),
			},
			matchMedia: () => media,
		},
		document: {
			documentElement: {
				classList: { toggle: (name: string, active: boolean) => toggles.push([name, active]) },
			},
		},
	});

	return {
		setSystemDark: (isDark: boolean) => {
			media.matches = isDark;
			listener?.();
		},
		toggles,
		values,
	};
}

test('BrowserPreferences persists the locale and reacts to system-theme changes', () => {
	const environment = createBrowserEnvironment();
	const preferences = new BrowserPreferences('clinks');

	preferences.saveLocale('de-CH');
	preferences.saveTheme('system');
	assert.equal(preferences.loadLocale(), 'de-CH');
	assert.equal(preferences.loadTheme(), 'system');

	preferences.applyTheme('system');
	const stop = preferences.watchSystemTheme(() => preferences.applyTheme('system'));
	environment.setSystemDark(true);
	stop();
	environment.setSystemDark(false);

	assert.deepEqual(environment.toggles, [
		['dark', false],
		['dark', true],
	]);
	assert.equal(environment.values.get('clinks-locale'), 'de-CH');
	assert.equal(environment.values.get('clinks-theme'), 'system');
});
