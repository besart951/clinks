/** Remembers which accordion sections are open, per browser. */
const sectionStorageKey = 'clinks.workspace.sections';

export function sectionOpen(id: string, fallback: boolean): boolean {
	try {
		const stored = JSON.parse(localStorage.getItem(sectionStorageKey) ?? '{}') as { [id: string]: boolean };
		return stored[id] ?? fallback;
	} catch {
		return fallback;
	}
}

export function rememberSection(id: string, open: boolean) {
	try {
		const stored = JSON.parse(localStorage.getItem(sectionStorageKey) ?? '{}') as { [id: string]: boolean };
		stored[id] = open;
		localStorage.setItem(sectionStorageKey, JSON.stringify(stored));
	} catch {
		// Open state applies to this visit only.
	}
}
