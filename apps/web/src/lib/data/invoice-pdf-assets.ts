import regularUrl from '@clinks/invoice-pdf/assets/LiberationSans-Regular.ttf?url';
import boldUrl from '@clinks/invoice-pdf/assets/LiberationSans-Bold.ttf?url';
import iccUrl from '@clinks/invoice-pdf/assets/sRGB.icc?url';
import type { PdfAssets } from '@clinks/invoice-pdf/render';
import { bytesOf } from './data-url.ts';

let loaded: Promise<PdfAssets> | undefined;

/** The PDF fonts and colour profile in the browser; inlined as data URLs in the single-file build. */
export function browserPdfAssets(): Promise<PdfAssets> {
	loaded ??= Promise.all([regularUrl, boldUrl, iccUrl].map(bytesOf)).then(([regular, bold, icc]) => ({
		regular,
		bold,
		icc,
	}));
	return loaded;
}
