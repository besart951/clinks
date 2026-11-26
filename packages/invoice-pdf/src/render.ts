import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFHexString, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { streetLine } from '@clinks/domain/address';
import { invoiceTotals, lineNet } from '@clinks/domain/money';
import { formatIban, formatReference, paymentDetails, qrBillPayload } from '@clinks/domain/qr-bill';
import type { Address, Invoice, Rappen, Tenant } from '@clinks/domain/types';
import { pdfLabelKeys, type PdfLabel, type Translate } from './labels.ts';

/** Fonts and the colour profile, loaded by the caller: from disk in Node, by URL in the browser. */
export interface PdfAssets {
	regular: Uint8Array;
	bold: Uint8Array;
	/** sRGB ICC profile for the PDF/A output intent. */
	icc: Uint8Array;
}

export interface PdfParty {
	name: string;
	address: Address;
}

/** A reminder printed instead of the invoice: its level, fee and the amount still open. */
export interface PdfReminder {
	level: number;
	date: string;
	fee: Rappen;
	dueDate: string;
	text: string;
}

export interface InvoicePdfInput {
	tenant: Pick<Tenant, 'name' | 'address' | 'vatNumber' | 'iban' | 'qrIban' | 'brandColor' | 'logoDataUrl'> & {
		invoiceSettings: Pick<Tenant['invoiceSettings'], 'footer'>;
	};
	recipient: PdfParty | null;
	invoice: Pick<
		Invoice,
		| 'number'
		| 'kind'
		| 'issueDate'
		| 'dueDate'
		| 'lines'
		| 'payments'
		| 'notes'
		| 'serviceFrom'
		| 'serviceTo'
		| 'createdAt'
	>;
	reminder?: PdfReminder;
	locale: 'de-CH' | 'en-US';
	t: Translate;
	/** Creation time written into the file and its metadata; fixed in tests. */
	now?: Date;
}

const mm = 72 / 25.4;
const pageWidth = 210 * mm;
const pageHeight = 297 * mm;
const margin = 20 * mm;
/** Height of the Swiss QR payment part at the foot of the last page (SIX style guide). */
const qrPartHeight = 105 * mm;
const ink = rgb(0.09, 0.09, 0.11);
const muted = rgb(0.4, 0.4, 0.44);
const rule = rgb(0.8, 0.8, 0.84);

/** Renders an invoice or a reminder as PDF/A-2b, the QR payment part at the foot of its last page. */
export async function renderInvoicePdf(input: InvoicePdfInput, assets: PdfAssets): Promise<Uint8Array> {
	const now = input.now ?? new Date();
	const doc = await PDFDocument.create({ updateMetadata: false });
	doc.registerFontkit(fontkit);
	const fonts = {
		regular: await doc.embedFont(assets.regular, { subset: true }),
		bold: await doc.embedFont(assets.bold, { subset: true }),
	};
	const label = (key: PdfLabel, params?: Record<string, string | number>) => input.t(pdfLabelKeys[key], params);
	const format = formatters(input.locale);
	const title = input.reminder
		? `${label('reminder', { level: input.reminder.level })} · ${input.invoice.number}`
		: `${label(input.invoice.kind === 'credit_note' ? 'creditNote' : 'invoice')} ${input.invoice.number}`;

	const writer = new PageWriter(doc, fonts);
	await drawHeader(writer, input);
	writer.text(title, { font: fonts.bold, size: 16 });
	writer.gap(2 * mm);
	for (const line of introLines(input, label, format)) writer.text(line, { color: muted, size: 9.5 });
	writer.gap(6 * mm);
	if (input.reminder) drawReminder(writer, input, label, format);
	else drawLines(writer, input, label, format);
	const totals = invoiceTotals(input.invoice);
	const open = Math.max(0, totals.balance) + (input.reminder?.fee ?? 0);
	if (!input.reminder) drawTotals(writer, totals, label, format);
	if (input.invoice.notes && !input.reminder) writer.paragraph(input.invoice.notes, { size: 9.5 });
	writer.gap(4 * mm);
	writer.text(label('thanks'), { color: muted, size: 9.5 });
	if (input.tenant.invoiceSettings.footer) {
		writer.gap(3 * mm);
		writer.paragraph(input.tenant.invoiceSettings.footer, { size: 8, color: muted });
	}
	const qrPage = writer.reserve(qrPartHeight);
	await drawPaymentPart(qrPage, fonts, input, open, label);
	writer.numberPages((page, count) => label('page', { page, count }));

	setPdfA(doc, { title, author: input.tenant.name, now, icc: assets.icc, lang: input.locale });
	return doc.save({ useObjectStreams: false });
}

type Formatters = ReturnType<typeof formatters>;

function formatters(locale: string) {
	const date = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
	const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
	return {
		date: (value: string) => date.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)),
		money: (rappen: number) => number.format(rappen / 100),
		quantity: (value: number) => quantity.format(value),
		percent: (basisPoints: number) => `${quantity.format(basisPoints / 100)} %`,
	};
}

function introLines(input: InvoicePdfInput, label: Label, format: Formatters): string[] {
	const { invoice, reminder } = input;
	if (reminder)
		return [
			label('reminderDates', { issued: format.date(reminder.date), due: format.date(reminder.dueDate) }),
			label('message', { number: invoice.number }),
		];
	const lines = [label('dates', { issued: format.date(invoice.issueDate), due: format.date(invoice.dueDate) })];
	if (invoice.serviceFrom && invoice.serviceTo)
		lines.push(
			invoice.serviceFrom === invoice.serviceTo
				? label('serviceDate', { date: format.date(invoice.serviceFrom) })
				: label('servicePeriod', { from: format.date(invoice.serviceFrom), to: format.date(invoice.serviceTo) }),
		);
	return lines;
}

type Label = (key: PdfLabel, params?: Record<string, string | number>) => string;
type Fonts = { regular: PDFFont; bold: PDFFont };

/** Writes top to bottom, wrapping text and starting a new page when the next block does not fit. */
class PageWriter {
	readonly #doc: PDFDocument;
	readonly fonts: Fonts;
	page: PDFPage;
	y = pageHeight - margin;

	constructor(doc: PDFDocument, fonts: Fonts) {
		this.#doc = doc;
		this.fonts = fonts;
		this.page = doc.addPage([pageWidth, pageHeight]);
	}

	ensure(height: number) {
		if (this.y - height < margin + 8 * mm) this.newPage();
	}

	newPage() {
		this.page = this.#doc.addPage([pageWidth, pageHeight]);
		this.y = pageHeight - margin;
	}

	gap(height: number) {
		this.y -= height;
	}

	text(
		value: string,
		options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; align?: 'right' } = {},
	) {
		const font = options.font ?? this.fonts.regular;
		const size = options.size ?? 10;
		this.ensure(size * 1.4);
		const width = font.widthOfTextAtSize(value, size);
		const x = options.align === 'right' ? (options.x ?? pageWidth - margin) - width : (options.x ?? margin);
		this.page.drawText(value, { x, y: this.y - size, font, size, color: options.color ?? ink });
		this.y -= size * 1.4;
	}

	paragraph(value: string, options: { size?: number; color?: ReturnType<typeof rgb>; width?: number } = {}) {
		const size = options.size ?? 10;
		for (const line of wrap(value, this.fonts.regular, size, options.width ?? pageWidth - 2 * margin))
			this.text(line, { size, color: options.color });
	}

	/** Room at the foot of the last page, on a new page when the content left none. */
	reserve(height: number): PDFPage {
		if (this.y - height < margin) this.newPage();
		return this.page;
	}

	numberPages(text: (page: number, count: number) => string) {
		const pages = this.#doc.getPages();
		if (pages.length < 2) return;
		pages.forEach((page, index) => {
			const value = text(index + 1, pages.length);
			const width = this.fonts.regular.widthOfTextAtSize(value, 8);
			page.drawText(value, {
				x: pageWidth - margin - width,
				y: 10 * mm,
				size: 8,
				font: this.fonts.regular,
				color: muted,
			});
		});
	}
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
	const lines: string[] = [];
	for (const paragraph of value.split(/\r?\n/)) {
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			const next = line ? `${line} ${word}` : word;
			if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
			else {
				lines.push(line);
				line = word;
			}
		}
		lines.push(line);
	}
	return lines;
}

async function drawHeader(writer: PageWriter, input: InvoicePdfInput) {
	const { tenant, recipient } = input;
	const top = writer.y;
	const logo = tenant.logoDataUrl ? await embedLogo(writer, tenant.logoDataUrl) : null;
	if (logo) {
		const height = 12 * mm;
		const width = Math.min((logo.width / logo.height) * height, 60 * mm);
		writer.page.drawImage(logo, { x: margin, y: writer.y - height, width, height });
		writer.gap(height + 2 * mm);
	} else writer.text(tenant.name, { size: 13, color: brand(tenant.brandColor) });
	for (const line of [streetLine(tenant.address), `${tenant.address.zip} ${tenant.address.city}`, tenant.vatNumber])
		if (line.trim()) writer.text(line, { size: 9, color: muted });
	// The recipient sits where a right-hand window envelope shows it.
	if (recipient) {
		let y = top - 25 * mm;
		for (const line of partyLines(recipient)) {
			writer.page.drawText(line, { x: 118 * mm, y, size: 10, font: writer.fonts.regular, color: ink });
			y -= 14;
		}
	}
	writer.y = Math.min(writer.y, top - 62 * mm);
}

async function embedLogo(writer: PageWriter, dataUrl: string) {
	const match = /^data:image\/(png|jpe?g);base64,(.+)$/u.exec(dataUrl);
	if (!match) return null;
	const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
	const doc = writer.page.doc;
	try {
		return match[1] === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
	} catch {
		return null;
	}
}

function brand(color: string) {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(color);
	return match ? rgb(parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255) : ink;
}

function partyLines(party: PdfParty): string[] {
	return [party.name, streetLine(party.address), `${party.address.zip} ${party.address.city}`].filter((line) =>
		line.trim(),
	);
}

const columns = { quantity: 128 * mm, price: 152 * mm, vat: 170 * mm, amount: pageWidth - margin };

function drawLines(writer: PageWriter, input: InvoicePdfInput, label: Label, format: Formatters) {
	const bold = writer.fonts.bold;
	const regular = writer.fonts.regular;
	const header = () => {
		writer.ensure(14);
		const y = writer.y - 9;
		writer.page.drawText(label('position'), { x: margin, y, size: 8.5, font: bold, color: ink });
		for (const [key, x] of [
			['quantity', columns.quantity],
			['unitPrice', columns.price],
			['vat', columns.vat],
			['amount', columns.amount],
		] as const) {
			const value = label(key);
			writer.page.drawText(value, { x: x - bold.widthOfTextAtSize(value, 8.5), y, size: 8.5, font: bold, color: ink });
		}
		writer.y -= 14;
		writer.page.drawLine({
			start: { x: margin, y: writer.y + 2 },
			end: { x: pageWidth - margin, y: writer.y + 2 },
			thickness: 0.6,
			color: rule,
		});
	};
	header();
	for (const line of input.invoice.lines) {
		const description = wrap(line.description, regular, 9.5, columns.quantity - margin - 22 * mm);
		const height = description.length * 13 + 4;
		if (writer.y - height < margin + 8 * mm) {
			writer.newPage();
			header();
		}
		const y = writer.y - 9.5;
		description.forEach((text, index) =>
			writer.page.drawText(text, { x: margin, y: y - index * 13, size: 9.5, font: regular, color: ink }),
		);
		for (const [value, x] of [
			[format.quantity(line.quantity), columns.quantity],
			[format.money(line.unitPrice), columns.price],
			[format.percent(line.vatRate), columns.vat],
			[format.money(lineNet(line)), columns.amount],
		] as const)
			writer.page.drawText(value, {
				x: x - regular.widthOfTextAtSize(value, 9.5),
				y,
				size: 9.5,
				font: regular,
				color: ink,
			});
		writer.y -= height;
	}
	writer.gap(3 * mm);
}

function drawTotals(writer: PageWriter, totals: ReturnType<typeof invoiceTotals>, label: Label, format: Formatters) {
	const left = 120 * mm;
	const rows: [string, string, boolean][] = [[label('net'), format.money(totals.net), false]];
	for (const share of totals.shares.filter((share) => share.rate > 0))
		rows.push([
			label('vatOn', { rate: format.percent(share.rate), net: format.money(share.net) }),
			format.money(share.vat),
			false,
		]);
	rows.push([label('total'), format.money(totals.gross), true]);
	writer.ensure(rows.length * 14 + 10);
	const fonts = writer.fonts;
	for (const [name, value, strong] of rows) {
		const font = strong ? fonts.bold : fonts.regular;
		if (strong)
			writer.page.drawLine({
				start: { x: left, y: writer.y },
				end: { x: pageWidth - margin, y: writer.y },
				thickness: 0.6,
				color: rule,
			});
		writer.page.drawText(name, { x: left, y: writer.y - 11, size: 9.5, font, color: strong ? ink : muted });
		writer.page.drawText(value, {
			x: pageWidth - margin - font.widthOfTextAtSize(value, 9.5),
			y: writer.y - 11,
			size: 9.5,
			font,
			color: ink,
		});
		writer.y -= 15;
	}
	writer.gap(5 * mm);
}

function drawReminder(writer: PageWriter, input: InvoicePdfInput, label: Label, format: Formatters) {
	const reminder = input.reminder!;
	const totals = invoiceTotals(input.invoice);
	writer.paragraph(
		reminder.text ||
			label('reminderIntro', {
				number: input.invoice.number,
				date: format.date(input.invoice.issueDate),
				due: format.date(input.invoice.dueDate),
			}),
		{ size: 10 },
	);
	writer.gap(5 * mm);
	const rows: [string, number][] = [
		[label('reminderOpen', { number: input.invoice.number }), Math.max(0, totals.balance)],
	];
	if (reminder.fee > 0) rows.push([label('reminderFee'), reminder.fee]);
	rows.push([label('total'), Math.max(0, totals.balance) + reminder.fee]);
	const fonts = writer.fonts;
	rows.forEach(([name, value], index) => {
		const font = index === rows.length - 1 ? fonts.bold : fonts.regular;
		const amount = format.money(value);
		writer.page.drawText(name, { x: margin, y: writer.y - 11, size: 10, font, color: ink });
		writer.page.drawText(amount, {
			x: pageWidth - margin - font.widthOfTextAtSize(amount, 10),
			y: writer.y - 11,
			size: 10,
			font,
			color: ink,
		});
		writer.y -= 16;
	});
	writer.gap(4 * mm);
	writer.paragraph(label('reminderDue', { due: format.date(reminder.dueDate) }), { size: 10 });
}

/** The Swiss QR payment part: receipt (62 mm) and payment part (148 mm), 105 mm high, as in the SIX style guide. */
async function drawPaymentPart(page: PDFPage, fonts: Fonts, input: InvoicePdfInput, amount: Rappen, label: Label) {
	const details = paymentDetails(input.tenant, input.invoice.number);
	const top = qrPartHeight;
	const receiptWidth = 62 * mm;
	// Separation lines, with the note to cut along them.
	page.drawLine({
		start: { x: 0, y: top },
		end: { x: pageWidth, y: top },
		thickness: 0.5,
		color: ink,
		dashArray: [3, 2],
	});
	page.drawLine({
		start: { x: receiptWidth, y: 0 },
		end: { x: receiptWidth, y: top },
		thickness: 0.5,
		color: ink,
		dashArray: [3, 2],
	});
	const note = label('separate');
	page.drawText(note, {
		x: (pageWidth - fonts.regular.widthOfTextAtSize(note, 7)) / 2,
		y: top + 2 * mm,
		size: 7,
		font: fonts.regular,
		color: muted,
	});
	const money = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
		.format(amount / 100)
		.replace(/[’']/gu, ' ');
	const creditor = { name: input.tenant.name, address: input.tenant.address };
	const account = details ? formatIban(details.iban) : formatIban(input.tenant.iban);
	const reference = details?.reference ? formatReference(details.reference) : null;
	const message = label('message', { number: input.invoice.number });

	// Receipt.
	let y = top - 5 * mm;
	const rx = 5 * mm;
	const block = (heading: string, lines: string[], x: number, size: number, headingSize: number, width: number) => {
		page.drawText(heading, { x, y: y - headingSize, size: headingSize, font: fonts.bold, color: ink });
		y -= headingSize + 2;
		for (const line of lines.flatMap((value) => wrap(value, fonts.regular, size, width))) {
			page.drawText(line, { x, y: y - size, size, font: fonts.regular, color: ink });
			y -= size + 1.5;
		}
		y -= 9;
	};
	page.drawText(label('receipt'), { x: rx, y: y - 11, size: 11, font: fonts.bold, color: ink });
	y -= 7 * mm;
	block(label('account'), [account, ...partyLines(creditor)], rx, 8, 6, 52 * mm);
	if (reference) block(label('reference'), [reference], rx, 8, 6, 52 * mm);
	block(
		input.recipient ? label('payableBy') : label('payableByBlank'),
		input.recipient ? partyLines(input.recipient) : [],
		rx,
		8,
		6,
		52 * mm,
	);
	drawAmount(page, fonts, rx, 37 * mm, label, money, 6, 8);
	const acceptance = label('acceptancePoint');
	page.drawText(acceptance, {
		x: receiptWidth - 5 * mm - fonts.bold.widthOfTextAtSize(acceptance, 6),
		y: 23 * mm,
		size: 6,
		font: fonts.bold,
		color: ink,
	});

	// Payment part.
	const px = receiptWidth + 5 * mm;
	page.drawText(label('paymentPart'), { x: px, y: top - 5 * mm - 11, size: 11, font: fonts.bold, color: ink });
	if (details)
		await drawQrCode(
			page,
			qrBillPayload({
				iban: details.iban,
				creditor,
				debtor: input.recipient,
				amount,
				reference: details.reference,
				message,
			}),
			px,
			top - 17 * mm - 46 * mm,
		);
	drawAmount(page, fonts, px, 37 * mm, label, money, 8, 10);
	y = top - 5 * mm;
	const cx = 118 * mm;
	block(label('account'), [account, ...partyLines(creditor)], cx, 10, 8, 87 * mm);
	if (reference) block(label('reference'), [reference], cx, 10, 8, 87 * mm);
	block(label('additionalInfo'), [message], cx, 10, 8, 87 * mm);
	block(
		input.recipient ? label('payableBy') : label('payableByBlank'),
		input.recipient ? partyLines(input.recipient) : [],
		cx,
		10,
		8,
		87 * mm,
	);
}

function drawAmount(
	page: PDFPage,
	fonts: Fonts,
	x: number,
	y: number,
	label: Label,
	money: string,
	headingSize: number,
	size: number,
) {
	page.drawText(label('currency'), { x, y, size: headingSize, font: fonts.bold, color: ink });
	page.drawText(label('amount'), { x: x + 14 * mm, y, size: headingSize, font: fonts.bold, color: ink });
	page.drawText('CHF', { x, y: y - size - 3, size, font: fonts.regular, color: ink });
	page.drawText(money, { x: x + 14 * mm, y: y - size - 3, size, font: fonts.regular, color: ink });
}

/** The Swiss QR code, 46 × 46 mm without quiet zone, error correction M, with the Swiss cross of 7 mm. */
async function drawQrCode(page: PDFPage, payload: string, x: number, y: number) {
	const code = QRCode.create(payload, { errorCorrectionLevel: 'M' });
	const size = code.modules.size;
	const cell = (46 * mm) / size;
	for (let row = 0; row < size; row++)
		for (let column = 0; column < size; column++)
			if (code.modules.get(row, column))
				page.drawRectangle({
					x: x + column * cell,
					y: y + (size - row - 1) * cell,
					width: cell + 0.01,
					height: cell + 0.01,
					color: rgb(0, 0, 0),
				});
	const center = { x: x + 23 * mm, y: y + 23 * mm };
	const square = (side: number, color: ReturnType<typeof rgb>) =>
		page.drawRectangle({ x: center.x - side / 2, y: center.y - side / 2, width: side, height: side, color });
	square(7 * mm, rgb(1, 1, 1));
	square(6.2 * mm, rgb(0, 0, 0));
	const arm = 3.9 * mm;
	const thick = 1.2 * mm;
	page.drawRectangle({
		x: center.x - arm / 2,
		y: center.y - thick / 2,
		width: arm,
		height: thick,
		color: rgb(1, 1, 1),
	});
	page.drawRectangle({
		x: center.x - thick / 2,
		y: center.y - arm / 2,
		width: thick,
		height: arm,
		color: rgb(1, 1, 1),
	});
}

/** PDF/A-2b: XMP metadata matching the document info, the sRGB output intent and a file identifier. */
function setPdfA(doc: PDFDocument, meta: { title: string; author: string; now: Date; icc: Uint8Array; lang: string }) {
	const producer = 'CLinks';
	doc.setTitle(meta.title, { showInWindowTitleBar: true });
	doc.setAuthor(meta.author);
	doc.setProducer(producer);
	doc.setCreator(producer);
	doc.setCreationDate(meta.now);
	doc.setModificationDate(meta.now);
	const iso = meta.now.toISOString().replace(/\.\d{3}Z$/u, 'Z');
	const xml = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:title>
<dc:creator><rdf:Seq><rdf:li>${escapeXml(meta.author)}</rdf:li></rdf:Seq></dc:creator>
<xmp:CreateDate>${iso}</xmp:CreateDate>
<xmp:ModifyDate>${iso}</xmp:ModifyDate>
<xmp:CreatorTool>${producer}</xmp:CreatorTool>
<pdf:Producer>${producer}</pdf:Producer>
<pdfaid:part>2</pdfaid:part>
<pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
	const context = doc.context;
	const metadata = context.stream(new TextEncoder().encode(xml), { Type: 'Metadata', Subtype: 'XML' });
	doc.catalog.set(PDFName.of('Metadata'), context.register(metadata));
	const profile = context.register(context.flateStream(meta.icc, { N: 3 }));
	const intent = context.obj({
		Type: 'OutputIntent',
		S: 'GTS_PDFA1',
		OutputConditionIdentifier: PDFString.of('sRGB'),
		Info: PDFString.of('sRGB IEC61966-2.1'),
		DestOutputProfile: profile,
	});
	doc.catalog.set(PDFName.of('OutputIntents'), context.obj([intent]));
	doc.catalog.set(PDFName.of('Lang'), PDFString.of(meta.lang));
	const id = PDFHexString.of(
		Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(''),
	);
	context.trailerInfo.ID = context.obj([id, id]);
}

function escapeXml(value: string) {
	return value.replace(/[<>&'"]/gu, (char) => `&#${char.charCodeAt(0)};`);
}
