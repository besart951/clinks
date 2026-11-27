import { describe, expect, it } from 'vitest';
import { otsu, paperBounds, picturesToPdf } from '../src/lib/features/documents/scan';

/** A dark table with a light sheet at (20,10)–(79,89) in a 100×100 photo. */
function photo() {
	const gray = new Uint8Array(100 * 100).fill(40);
	for (let y = 10; y < 90; y++) for (let x = 20; x < 80; x++) gray[y * 100 + x] = 230;
	return gray;
}

describe('scanning', () => {
	it('splits dark from light', () => {
		const threshold = otsu(photo());
		expect(threshold).toBeGreaterThanOrEqual(40);
		expect(threshold).toBeLessThan(230);
	});

	it('finds the sheet on the table, with a small margin', () => {
		expect(paperBounds(photo(), 100, 100)).toEqual({ x: 19, y: 9, width: 62, height: 82 });
	});

	it('keeps a photo that is all paper as it is', () => {
		expect(paperBounds(new Uint8Array(100 * 100).fill(230), 100, 100)).toBeNull();
	});

	it('writes a PDF with one page per picture and a valid cross-reference table', () => {
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
		const pdf = picturesToPdf([
			{ jpeg, width: 1000, height: 1400 },
			{ jpeg, width: 1400, height: 1000 },
		]);
		const text = new TextDecoder('latin1').decode(pdf);
		expect(text.startsWith('%PDF-1.4')).toBe(true);
		expect(text).toContain('/Count 2');
		expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
		const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
		expect(text.slice(xref, xref + 4)).toBe('xref');
		const first = Number(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/.exec(text)![1]);
		expect(text.slice(first, first + 7)).toBe('1 0 obj');
	});
});
