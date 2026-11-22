import type { Preferences } from '../../platform/types.ts';

const storageKey = 'clinks.workspace.sections';

/** Remembers which accordion sections are open. */
export function sectionOpen(preferences: Preferences, id: string, fallback: boolean): boolean {
	return preferences.read<{ [id: string]: boolean }>(storageKey, {})[id] ?? fallback;
}

export function rememberSection(preferences: Preferences, id: string, open: boolean) {
	preferences.write(storageKey, { ...preferences.read<{ [id: string]: boolean }>(storageKey, {}), [id]: open });
}
