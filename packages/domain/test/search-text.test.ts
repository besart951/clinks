import { describe, expect, it } from 'vitest';
import { excerpt, searchableText, searchTextLimit } from '../src/search-text.ts';

describe('search text', () => {
	it('keeps one line with single spaces, cut at the limit', () => {
		expect(searchableText('  Termin \n\n bestätigt  ')).toBe('Termin bestätigt');
		expect(searchableText('   ')).toBeNull();
		expect(searchableText('a'.repeat(searchTextLimit + 5))?.length).toBe(searchTextLimit);
	});

	it('shows the words around the first match', () => {
		const text = 'Mietvertrag zwischen Immobilien Seeland AG und der Praxis. Laufzeit bis 2029.';
		expect(excerpt(text, 'laufzeit', 10)).toBe('…der Praxis. Laufzeit bis 2029.');
		expect(excerpt(text, 'Miete?')).toBeNull();
	});
});
