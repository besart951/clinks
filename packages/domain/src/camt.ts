import { creditorReference, qrReference } from './qr-bill.ts';
import { invoiceTotals } from './money.ts';
import type { CalendarDate, Invoice, Rappen } from './types.ts';

/**
 * Credits from an ISO 20022 bank file: camt.054 (debit/credit notification) and camt.053 (statement), as Swiss banks
 * deliver them for QR bills. Only booked credits are read; debits, reversals and pending entries are left out.
 */
export interface BankCredit {
	/** The bank's reference of the entry (AcctSvcrRef), so the same file booked twice books nothing twice. */
	bankRef: string;
	date: CalendarDate;
	amount: Rappen;
	currency: string;
	/** QR reference or Creditor Reference without spaces; '' when the payer gave none. */
	reference: string;
	debtor: string;
	/** Unstructured message of the payer. */
	info: string;
}

export interface BankFile {
	kind: 'camt.053' | 'camt.054';
	credits: BankCredit[];
}

/** Parses a camt.053 or camt.054 file; throws `CamtError` for anything else. */
export function parseCamt(xml: string): BankFile {
	const root = parseXml(xml);
	const document = root.name === 'Document' ? root : null;
	const notification = document && child(document, 'BkToCstmrDbtCdtNtfctn');
	const statement = document && child(document, 'BkToCstmrStmt');
	if (!notification && !statement) throw new CamtError('not_camt');
	const reports = notification ? children(notification, 'Ntfctn') : children(statement!, 'Stmt');
	const credits: BankCredit[] = [];
	for (const report of reports)
		for (const entry of children(report, 'Ntry')) {
			if (text(entry, 'CdtDbtInd') !== 'CRDT' || text(entry, 'RvslInd') === 'true') continue;
			const status = text(entry, 'Sts', 'Cd') || text(entry, 'Sts');
			if (status && status !== 'BOOK') continue;
			const date = (text(entry, 'BookgDt', 'Dt') || text(entry, 'ValDt', 'Dt') || text(entry, 'BookgDt', 'DtTm')).slice(
				0,
				10,
			);
			const entryRef = text(entry, 'AcctSvcrRef') || text(entry, 'NtryRef');
			const details = children(entry, 'NtryDtls').flatMap((group) => children(group, 'TxDtls'));
			const items = details.length > 0 ? details : [entry];
			items.forEach((item, index) => {
				const amountNode = child(item, 'Amt') ?? child(item, 'AmtDtls', 'TxAmt', 'Amt') ?? child(entry, 'Amt');
				if (!amountNode) return;
				const reference = text(item, 'RmtInf', 'Strd', 'CdtrRefInf', 'Ref');
				credits.push({
					bankRef: text(item, 'Refs', 'AcctSvcrRef') || (entryRef ? `${entryRef}/${index + 1}` : ''),
					date,
					amount: toRappen(amountNode.text),
					currency: amountNode.attributes.Ccy ?? '',
					reference: normalizeReference(reference),
					debtor: text(item, 'RltdPties', 'Dbtr', 'Nm') || text(item, 'RltdPties', 'Dbtr', 'Pty', 'Nm'),
					info: children(child(item, 'RmtInf') ?? emptyNode, 'Ustrd')
						.map((node) => node.text)
						.join(' ')
						.trim(),
				});
			});
		}
	if (credits.some((credit) => !credit.bankRef || !/^\d{4}-\d{2}-\d{2}$/.test(credit.date)))
		throw new CamtError('incomplete');
	return { kind: notification ? 'camt.054' : 'camt.053', credits };
}

export class CamtError extends Error {
	readonly reason: 'not_xml' | 'not_camt' | 'incomplete';
	constructor(reason: 'not_xml' | 'not_camt' | 'incomplete') {
		super(`camt: ${reason}`);
		this.name = 'CamtError';
		this.reason = reason;
	}
}

export function normalizeReference(reference: string) {
	return reference.replace(/\s+/g, '').toUpperCase();
}

/** The references a payment for an invoice can carry: its QR reference and its Creditor Reference. */
export function invoiceReferences(number: string): string[] {
	if (!/\d/.test(number)) return [];
	return [qrReference(number), creditorReference(number)];
}

type Matchable = Pick<Invoice, 'id' | 'number' | 'status' | 'lines' | 'payments' | 'reminders' | 'contactId'>;

/** The open invoice a credit pays, by its reference; null when the reference is missing or unknown. */
export function matchCredit<T extends Matchable>(credit: Pick<BankCredit, 'reference'>, invoices: readonly T[]) {
	if (!credit.reference) return null;
	return (
		invoices.find(
			(invoice) =>
				invoice.status !== 'draft' &&
				invoice.status !== 'cancelled' &&
				invoiceReferences(invoice.number).includes(credit.reference),
		) ?? null
	);
}

/**
 * Invoices a credit without a usable reference may pay, best first: the exact open amount, then the payer's name
 * matching the recipient's. At most three.
 */
export function suggestInvoices<T extends Matchable>(
	credit: Pick<BankCredit, 'amount' | 'debtor'>,
	invoices: readonly T[],
	nameOf: (invoice: T) => string,
): T[] {
	const debtor = credit.debtor.toLowerCase();
	const scored = invoices
		.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled')
		.map((invoice) => {
			const balance = invoiceTotals(invoice).balance;
			if (balance <= 0) return null;
			const name = nameOf(invoice).toLowerCase();
			const named =
				name !== '' &&
				debtor !== '' &&
				name
					.split(/\s+/)
					.filter((part) => part.length > 2)
					.some((part) => debtor.includes(part));
			const score = (balance === credit.amount ? 2 : 0) + (named ? 1 : 0);
			return score > 0 ? { invoice, score } : null;
		})
		.filter((item) => item !== null)
		.sort((left, right) => right.score - left.score || left.invoice.number.localeCompare(right.invoice.number));
	return scored.slice(0, 3).map((item) => item.invoice);
}

function toRappen(value: string) {
	const [francs, cents = ''] = value.trim().split('.');
	return Number(francs) * 100 + Number(cents.padEnd(2, '0').slice(0, 2));
}

/* A small XML reader for bank files: elements, attributes, text and CDATA. Document type declarations are refused,
 * so entity tricks cannot expand; namespaces are dropped from names. */

interface XmlNode {
	name: string;
	attributes: Record<string, string>;
	children: XmlNode[];
	text: string;
}

const emptyNode: XmlNode = { name: '', attributes: {}, children: [], text: '' };

function child(node: XmlNode, ...path: string[]): XmlNode | null {
	let current: XmlNode | null = node;
	for (const name of path) current = current?.children.find((candidate) => candidate.name === name) ?? null;
	return current;
}

function children(node: XmlNode, name: string) {
	return node.children.filter((candidate) => candidate.name === name);
}

function text(node: XmlNode, ...path: string[]) {
	return child(node, ...path)?.text.trim() ?? '';
}

const entities: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(value: string) {
	return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
		if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(parseInt(code.slice(2), 16));
		if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
		return entities[code] ?? match;
	});
}

function localName(name: string) {
	return name.slice(name.indexOf(':') + 1);
}

function parseXml(xml: string): XmlNode {
	const stack: XmlNode[] = [{ ...emptyNode, children: [] }];
	let position = 0;
	const fail = () => {
		throw new CamtError('not_xml');
	};
	while (position < xml.length) {
		const open = xml.indexOf('<', position);
		const textEnd = open === -1 ? xml.length : open;
		if (textEnd > position) stack.at(-1)!.text += decode(xml.slice(position, textEnd));
		if (open === -1) break;
		if (xml.startsWith('<?', open)) {
			position = xml.indexOf('?>', open) + 2;
			if (position < 2) fail();
		} else if (xml.startsWith('<!--', open)) {
			position = xml.indexOf('-->', open) + 3;
			if (position < 3) fail();
		} else if (xml.startsWith('<![CDATA[', open)) {
			const end = xml.indexOf(']]>', open);
			if (end === -1) fail();
			stack.at(-1)!.text += xml.slice(open + 9, end);
			position = end + 3;
		} else if (xml.startsWith('<!', open)) {
			fail();
		} else if (xml.startsWith('</', open)) {
			const end = xml.indexOf('>', open);
			if (end === -1) fail();
			const name = localName(xml.slice(open + 2, end).trim());
			const node = stack.pop()!;
			if (node.name !== name || stack.length === 0) fail();
			position = end + 1;
		} else {
			const end = xml.indexOf('>', open);
			if (end === -1) fail();
			let body = xml.slice(open + 1, end);
			const selfClosing = body.endsWith('/');
			if (selfClosing) body = body.slice(0, -1);
			const match = /^([^\s/>]+)/.exec(body);
			if (!match) fail();
			const attributes: Record<string, string> = {};
			for (const attribute of body.slice(match![1].length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g))
				attributes[localName(attribute[1])] = decode(attribute[3] ?? attribute[4] ?? '');
			const node: XmlNode = { name: localName(match![1]), attributes, children: [], text: '' };
			stack.at(-1)!.children.push(node);
			if (!selfClosing) stack.push(node);
			position = end + 1;
		}
	}
	if (stack.length !== 1 || stack[0].children.length !== 1) fail();
	return stack[0].children[0];
}
