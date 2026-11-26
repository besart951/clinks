import { readFile } from 'node:fs/promises';
import type { PdfAssets } from './render.ts';

let loaded: Promise<PdfAssets> | undefined;

/** The fonts and the colour profile from this package's `assets` folder, read once. */
export function nodeAssets(): Promise<PdfAssets> {
	const file = (name: string) =>
		readFile(new URL(`../assets/${name}`, import.meta.url)).then((bytes) => new Uint8Array(bytes));
	loaded ??= Promise.all([file('LiberationSans-Regular.ttf'), file('LiberationSans-Bold.ttf'), file('sRGB.icc')]).then(
		([regular, bold, icc]) => ({ regular, bold, icc }),
	);
	return loaded;
}
