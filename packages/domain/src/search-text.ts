/** Enough to find a file by its words; the rest of a long file adds little to the search and a lot to sync. */
export const searchTextLimit = 20_000;

/** A file's text as it is kept for the search: one line, single spaces, at most `searchTextLimit` characters. */
export function searchableText(text: string): string | null {
	const compact = text.replace(/\s+/g, ' ').trim();
	return compact ? compact.slice(0, searchTextLimit) : null;
}

/** The part of the text around the first match, «…» where it is cut; null without a match. */
export function excerpt(text: string, query: string, around = 40): string | null {
	const needle = query.trim().toLowerCase();
	if (!needle) return null;
	const at = text.toLowerCase().indexOf(needle);
	if (at === -1) return null;
	// Whole words only: the cut moves out to the next space on either side.
	let start = Math.max(0, at - around);
	while (start > 0 && !/\s/.test(text[start - 1])) start--;
	let end = Math.min(text.length, at + needle.length + around);
	while (end < text.length && !/\s/.test(text[end])) end++;
	return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
