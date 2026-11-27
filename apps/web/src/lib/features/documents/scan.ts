/** A rectangle in image pixels. */
export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Otsu's threshold: the grey value that best splits a picture into dark and light. */
export function otsu(gray: Uint8ClampedArray | Uint8Array): number {
	const histogram = new Array<number>(256).fill(0);
	for (const value of gray) histogram[value]++;
	const total = gray.length;
	let sum = 0;
	for (let value = 0; value < 256; value++) sum += value * histogram[value];
	let background = 0;
	let backgroundSum = 0;
	let best = 0;
	let threshold = 127;
	for (let value = 0; value < 256; value++) {
		background += histogram[value];
		if (background === 0) continue;
		const foreground = total - background;
		if (foreground === 0) break;
		backgroundSum += value * histogram[value];
		const meanBack = backgroundSum / background;
		const meanFore = (sum - backgroundSum) / foreground;
		const between = background * foreground * (meanBack - meanFore) ** 2;
		if (between > best) {
			best = between;
			threshold = value;
		}
	}
	return threshold;
}

/**
 * Where the sheet of paper is in a photo: paper is lighter than the table it lies on. Rows and columns that
 * are mostly light belong to it; the box around them is the page, with a small margin kept. Null when nothing
 * stands out (the photo is all paper, or all background), so the photo is kept as it is.
 */
export function paperBounds(gray: Uint8ClampedArray | Uint8Array, width: number, height: number): Bounds | null {
	const threshold = otsu(gray);
	const share = 0.5;
	const rows: number[] = [];
	const columns = new Array<number>(width).fill(0);
	for (let y = 0; y < height; y++) {
		let light = 0;
		for (let x = 0; x < width; x++) {
			if (gray[y * width + x] > threshold) {
				light++;
				columns[x]++;
			}
		}
		if (light > width * share) rows.push(y);
	}
	const lightColumns = columns.flatMap((count, x) => (count > height * share ? [x] : []));
	if (rows.length === 0 || lightColumns.length === 0) return null;
	const top = rows[0];
	const bottom = rows[rows.length - 1];
	const left = lightColumns[0];
	const right = lightColumns[lightColumns.length - 1];
	const found = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
	// Hardly smaller than the photo: there was no background to cut away.
	if (found.width * found.height > width * height * 0.95) return null;
	const margin = Math.round(Math.min(width, height) * 0.01);
	const x = Math.max(0, found.x - margin);
	const y = Math.max(0, found.y - margin);
	return {
		x,
		y,
		width: Math.min(width - x, found.width + 2 * margin),
		height: Math.min(height - y, found.height + 2 * margin),
	};
}

/** A JPEG picture for a PDF page. */
export interface PdfPage {
	jpeg: Uint8Array;
	width: number;
	height: number;
}

/** A4 in PDF points. */
const a4 = { width: 595.28, height: 841.89 };

/**
 * A PDF with one picture per page, each scaled into an A4 page (turned to landscape for wide pictures). Written
 * by hand: JPEGs go into a PDF as they are (DCTDecode), so nothing is re-encoded and no library is needed.
 */
export function picturesToPdf(pages: PdfPage[]): Uint8Array<ArrayBuffer> {
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];
	const offsets: number[] = [];
	let length = 0;
	const push = (part: Uint8Array | string) => {
		const bytes = typeof part === 'string' ? encoder.encode(part) : part;
		parts.push(bytes);
		length += bytes.length;
	};
	const object = (id: number, body: () => void) => {
		offsets[id] = length;
		push(`${id} 0 obj\n`);
		body();
		push('\nendobj\n');
	};
	push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
	const kids = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
	object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
	object(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
	pages.forEach((page, index) => {
		const [pageId, imageId, contentId] = [3 + index * 3, 4 + index * 3, 5 + index * 3];
		const landscape = page.width > page.height;
		const box = landscape ? { width: a4.height, height: a4.width } : a4;
		const scale = Math.min(box.width / page.width, box.height / page.height);
		const [drawWidth, drawHeight] = [page.width * scale, page.height * scale];
		const [left, bottom] = [(box.width - drawWidth) / 2, (box.height - drawHeight) / 2];
		const content = `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${left.toFixed(2)} ${bottom.toFixed(2)} cm /Im Do Q`;
		object(pageId, () =>
			push(
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${box.width} ${box.height}] /Resources << /XObject << /Im ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
			),
		);
		object(imageId, () => {
			push(
				`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
			);
			push(page.jpeg);
			push('\nendstream');
		});
		object(contentId, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
	});
	const count = 3 + pages.length * 3;
	const xref = length;
	push(`xref\n0 ${count}\n0000000000 65535 f \n`);
	for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
	push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
	const pdf = new Uint8Array(length);
	let at = 0;
	for (const part of parts) {
		pdf.set(part, at);
		at += part.length;
	}
	return pdf;
}
