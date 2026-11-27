/** How a key is printed in menus and the shortcut overview: `Delete` → «Entf», `s` → «S». */
export function keyLabel(key: string, names: Partial<Record<string, string>> = {}): string {
	return names[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}
