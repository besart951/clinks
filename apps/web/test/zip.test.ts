import { describe, expect, it } from 'vitest';
import { crc32, uniqueNames, zipFiles } from '../src/lib/features/documents/zip';

describe('zip', () => {
	it('computes CRC-32 as ZIP needs it', () => {
		expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
	});

	it('keeps names unique', () => {
		expect(uniqueNames(['Bericht.pdf', 'bericht.pdf', 'Notiz', 'Notiz'])).toEqual([
			'Bericht.pdf',
			'bericht (2).pdf',
			'Notiz',
			'Notiz (2)',
		]);
	});

	it('writes local headers, the directory and its end record', () => {
		const bytes = new TextEncoder().encode('Termin bestätigt');
		const archive = zipFiles([
			{ name: 'Brief.txt', bytes, modified: new Date(2026, 10, 27, 10, 0) },
			{ name: 'Brief.txt', bytes, modified: new Date(2026, 10, 27, 10, 0) },
		]);
		const view = new DataView(archive.buffer);
		expect(view.getUint32(0, true)).toBe(0x04034b50);
		const end = archive.length - 22;
		expect(view.getUint32(end, true)).toBe(0x06054b50);
		expect(view.getUint16(end + 10, true)).toBe(2);
		const directory = view.getUint32(end + 16, true);
		expect(view.getUint32(directory, true)).toBe(0x02014b50);
		expect(view.getUint32(directory + 16, true)).toBe(crc32(bytes));
		expect(new TextDecoder().decode(archive)).toContain('Brief (2).txt');
	});
});
