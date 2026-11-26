import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, it } from 'vitest';
import { nodeAssets } from '../src/node-assets.ts';
import { renderInvoicePdf, type InvoicePdfInput } from '../src/render.ts';

const t = (key: string, params: Record<string, string | number> = {}) =>
	`${key.split('.').at(-1)}${Object.values(params).length ? ` ${Object.values(params).join(' ')}` : ''}`;

const address = { street: 'Zentralplatz', houseNumber: '1', zip: '2502', city: 'Biel/Bienne' };
const input = (overrides: Partial<InvoicePdfInput> = {}): InvoicePdfInput => ({
	tenant: {
		name: 'Stille Physio',
		address,
		vatNumber: 'CHE-123.456.789 MWST',
		iban: 'CH93 0076 2011 6238 5295 7',
		qrIban: 'CH44 3199 9123 0008 8901 2',
		brandColor: '#0f766e',
		logoDataUrl: null,
		invoiceSettings: { footer: 'Zahlbar innert 30 Tagen ohne Abzug.' },
	},
	recipient: { name: 'Lea Muster', address: { street: 'Weg', houseNumber: '7', zip: '3000', city: 'Bern' } },
	invoice: {
		number: '2026-0042',
		kind: 'invoice',
		issueDate: '2026-11-26',
		dueDate: '2026-12-26',
		lines: [
			{ description: 'Beratung', quantity: 2, unitPrice: 12000, vatRate: 810 },
			{ description: 'Material', quantity: 1, unitPrice: 4550, vatRate: 810 },
		],
		payments: [],
		notes: '',
		serviceFrom: '2026-11-02',
		serviceTo: '2026-11-20',
		createdAt: '2026-11-26T10:00:00.000Z',
	},
	locale: 'de-CH',
	t,
	now: new Date('2026-11-26T10:00:00Z'),
	...overrides,
});

async function inspect(bytes: Uint8Array) {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const catalog = doc.catalog;
	const fonts: PDFDict[] = [];
	for (const [, object] of doc.context.enumerateIndirectObjects())
		if (object instanceof PDFDict && object.get(PDFName.of('Type')) === PDFName.of('FontDescriptor'))
			fonts.push(object);
	const metadata = doc.context.lookup(catalog.get(PDFName.of('Metadata'))) as PDFRawStream;
	return {
		pages: doc.getPageCount(),
		title: doc.getTitle(),
		hasIntent: catalog.has(PDFName.of('OutputIntents')),
		xmp: new TextDecoder().decode(metadata.contents),
		embedded: fonts.length > 0 && fonts.every((font) => font.has(PDFName.of('FontFile2'))),
	};
}

describe('invoice PDF', () => {
	it('is a one-page PDF/A-2b with embedded fonts, metadata and output intent', async () => {
		const bytes = await renderInvoicePdf(input(), await nodeAssets());
		await writeFile('/tmp/invoice-sample.pdf', bytes);
		const pdf = await inspect(bytes);
		assert.equal(pdf.pages, 1);
		assert.equal(pdf.title, 'invoice 2026-0042');
		assert.ok(pdf.hasIntent);
		assert.ok(pdf.embedded);
		assert.match(pdf.xmp, /<pdfaid:part>2<\/pdfaid:part>/);
		assert.match(pdf.xmp, /<pdfaid:conformance>B<\/pdfaid:conformance>/);
		assert.ok(bytes.length < 200_000, `size ${bytes.length}`);
	});

	it('continues on further pages and keeps the payment part on the last one', async () => {
		const lines = Array.from({ length: 45 }, (_, index) => ({
			description: `Position ${index + 1} mit einer längeren Beschreibung, die umbrechen muss, weil sie breit ist`,
			quantity: 1,
			unitPrice: 1000,
			vatRate: 0 as const,
		}));
		const base = input();
		const bytes = await renderInvoicePdf(input({ invoice: { ...base.invoice, lines } }), await nodeAssets());
		assert.ok((await inspect(bytes)).pages >= 3);
	});

	it('prints a reminder with fee and still renders without a QR-IBAN', async () => {
		const base = input();
		const bytes = await renderInvoicePdf(
			input({
				tenant: { ...base.tenant, qrIban: '' },
				reminder: { level: 1, date: '2026-12-30', fee: 2000, dueDate: '2027-01-09', text: '' },
			}),
			await nodeAssets(),
		);
		await writeFile('/tmp/reminder-sample.pdf', bytes);
		assert.equal((await inspect(bytes)).title, 'reminder 1 · 2026-0042');
	});
});
