/** Stable pastel hue and initials for people without a profile picture, as in the module artefacts. */
export function personBadge(name: string): { initials: string; hue: number } {
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');
	let hash = 0;
	for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) % 360;
	return { initials, hue: hash };
}
