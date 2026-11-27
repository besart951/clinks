import { paperBounds, type PdfPage } from '#lib/features/documents/scan';

/** How one photo becomes a page: turned, cut to the sheet, and as a clean black-and-white document. */
export interface PageSettings {
	rotate: 0 | 90 | 180 | 270;
	crop: boolean;
	enhance: boolean;
}

/** Long side of a page in pixels: sharp enough to read and print, small enough to upload from a phone. */
const longSide = 2000;
/** The sheet is looked for in a small copy; that is enough and fast. */
const probeSide = 240;

function canvas(width: number, height: number) {
	const element = document.createElement('canvas');
	element.width = Math.max(1, Math.round(width));
	element.height = Math.max(1, Math.round(height));
	return element;
}

/** Where the sheet is in the photo, in the photo's pixels; null keeps the whole photo. */
function findSheet(bitmap: ImageBitmap) {
	const scale = probeSide / Math.max(bitmap.width, bitmap.height);
	const probe = canvas(bitmap.width * scale, bitmap.height * scale);
	const context = probe.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(bitmap, 0, 0, probe.width, probe.height);
	const { data } = context.getImageData(0, 0, probe.width, probe.height);
	const gray = new Uint8ClampedArray(probe.width * probe.height);
	for (let index = 0; index < gray.length; index++)
		gray[index] = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
	const bounds = paperBounds(gray, probe.width, probe.height);
	return bounds
		? { x: bounds.x / scale, y: bounds.y / scale, width: bounds.width / scale, height: bounds.height / scale }
		: null;
}

/** The photo as a page: a JPEG for the PDF and a picture to show. */
export async function renderPage(file: File, settings: PageSettings): Promise<PdfPage & { preview: string }> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	const area = (settings.crop && findSheet(bitmap)) || { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
	const scale = Math.min(1, longSide / Math.max(area.width, area.height));
	const [width, height] = [area.width * scale, area.height * scale];
	const turned = settings.rotate === 90 || settings.rotate === 270;
	const page = canvas(turned ? height : width, turned ? width : height);
	const context = page.getContext('2d')!;
	context.fillStyle = '#fff';
	context.fillRect(0, 0, page.width, page.height);
	if (settings.enhance) context.filter = 'grayscale(1) contrast(1.5) brightness(1.08)';
	context.translate(page.width / 2, page.height / 2);
	context.rotate((settings.rotate * Math.PI) / 180);
	context.drawImage(bitmap, area.x, area.y, area.width, area.height, -width / 2, -height / 2, width, height);
	bitmap.close();
	const blob = await new Promise<Blob>((resolve, reject) =>
		page.toBlob((result) => (result ? resolve(result) : reject(new Error('jpeg'))), 'image/jpeg', 0.85),
	);
	return {
		jpeg: new Uint8Array(await blob.arrayBuffer()),
		width: page.width,
		height: page.height,
		preview: URL.createObjectURL(blob),
	};
}
