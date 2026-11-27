/** One file for `zipFiles`. */
export interface ZipEntry {
	name: string;
	bytes: Uint8Array;
	modified: Date;
}

const table = (() => {
	const values = new Uint32Array(256);
	for (let index = 0; index < 256; index++) {
		let value = index;
		for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		values[index] = value >>> 0;
	}
	return values;
})();

export function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date and time, as ZIP stores them (local time, two-second steps). */
function dosTime(date: Date) {
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
		date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
	};
}

/** Names unique inside the archive: a second «Bericht.pdf» becomes «Bericht (2).pdf». */
export function uniqueNames(names: string[]): string[] {
	const used = new Map<string, number>();
	return names.map((name) => {
		const key = name.toLowerCase();
		const count = (used.get(key) ?? 0) + 1;
		used.set(key, count);
		if (count === 1) return name;
		const dot = name.lastIndexOf('.');
		return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
	});
}

/**
 * A ZIP archive of the files, stored without compression: documents are mostly PDFs and pictures, which are
 * compressed already, and every system opens such an archive. Names are UTF-8 (flag bit 11).
 */
export function zipFiles(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
	const encoder = new TextEncoder();
	const names = uniqueNames(entries.map((entry) => entry.name)).map((name) => encoder.encode(name));
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;
	entries.forEach((entry, index) => {
		const name = names[index];
		const crc = crc32(entry.bytes);
		const { time, date } = dosTime(entry.modified);
		const local = new Uint8Array(30 + name.length);
		const head = new DataView(local.buffer);
		head.setUint32(0, 0x04034b50, true);
		head.setUint16(4, 20, true);
		head.setUint16(6, 0x0800, true);
		head.setUint16(8, 0, true);
		head.setUint16(10, time, true);
		head.setUint16(12, date, true);
		head.setUint32(14, crc, true);
		head.setUint32(18, entry.bytes.length, true);
		head.setUint32(22, entry.bytes.length, true);
		head.setUint16(26, name.length, true);
		local.set(name, 30);
		const central = new Uint8Array(46 + name.length);
		const directory = new DataView(central.buffer);
		directory.setUint32(0, 0x02014b50, true);
		directory.setUint16(4, 20, true);
		directory.setUint16(6, 20, true);
		directory.setUint16(8, 0x0800, true);
		directory.setUint16(10, 0, true);
		directory.setUint16(12, time, true);
		directory.setUint16(14, date, true);
		directory.setUint32(16, crc, true);
		directory.setUint32(20, entry.bytes.length, true);
		directory.setUint32(24, entry.bytes.length, true);
		directory.setUint16(28, name.length, true);
		directory.setUint32(42, offset, true);
		central.set(name, 46);
		locals.push(local, entry.bytes);
		centrals.push(central);
		offset += local.length + entry.bytes.length;
	});
	const size = centrals.reduce((sum, part) => sum + part.length, 0);
	const end = new Uint8Array(22);
	const tail = new DataView(end.buffer);
	tail.setUint32(0, 0x06054b50, true);
	tail.setUint16(8, entries.length, true);
	tail.setUint16(10, entries.length, true);
	tail.setUint32(12, size, true);
	tail.setUint32(16, offset, true);
	const parts = [...locals, ...centrals, end];
	const archive = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		archive.set(part, at);
		at += part.length;
	}
	return archive;
}
