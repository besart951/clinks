import type { Address, Rappen } from './types.ts';

export interface QrBillInput {
	iban: string;
	creditor: { name: string; address: Address };
	debtor: { name: string; address: Address } | null;
	amount: Rappen | null;
	/** The structured reference, matched against incoming payments; `null` sends none (`NON`). */
	reference: PaymentReference | null;
	message: string;
}

export interface PaymentReference {
	/** `QRR`: Swiss QR reference, only with a QR-IBAN. `SCOR`: ISO 11649 creditor reference, with a normal IBAN. */
	type: 'QRR' | 'SCOR';
	value: string;
}

/** Strips spaces so an IBAN can be validated and encoded. */
export function compactIban(iban: string): string {
	return iban.replace(/\s+/g, '').toUpperCase();
}

/** Validates the ISO 13616 checksum; QR bills require a Swiss or Liechtenstein IBAN. */
export function isValidSwissIban(iban: string): boolean {
	const value = compactIban(iban);
	if (!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(value)) return false;
	const rearranged = value.slice(4) + value.slice(0, 4);
	const digits = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
	let remainder = 0;
	for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
	return remainder === 1;
}

/** A QR-IBAN carries a QR-IID between 30000 and 31999 in place of the bank's usual identifier (SIX). */
export function isQrIban(iban: string): boolean {
	if (!isValidSwissIban(iban)) return false;
	const iid = Number(compactIban(iban).slice(4, 9));
	return iid >= 30000 && iid <= 31999;
}

const modulo10Table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];

/** The check digit of a QR reference: recursive modulo 10, as for the old orange slips. */
export function modulo10(digits: string): number {
	let carry = 0;
	for (const digit of digits) carry = modulo10Table[(carry + Number(digit)) % 10];
	return (10 - carry) % 10;
}

function modulo97(text: string): number {
	const digits = text.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
	let remainder = 0;
	for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
	return remainder;
}

/** The 27-digit QR reference for an invoice number such as `2026-0042`: its digits, padded, plus the check digit. */
export function qrReference(invoiceNumber: string): string {
	const body = invoiceNumber.replace(/\D/g, '').padStart(26, '0').slice(-26);
	return body + modulo10(body);
}

/** The ISO 11649 creditor reference (`RF…`) for an invoice number: its digits behind two check digits. */
export function creditorReference(invoiceNumber: string): string {
	const body = invoiceNumber.replace(/[^0-9A-Z]/gi, '').toUpperCase();
	const check = 98 - modulo97(`${body}RF00`);
	return `RF${String(check).padStart(2, '0')}${body}`;
}

/** Whether a reference read from a QR code or a bank file is well formed and its check digits hold. */
export function isValidReference(reference: string): boolean {
	const value = reference.replace(/\s+/g, '').toUpperCase();
	if (/^\d{27}$/.test(value)) return modulo10(value.slice(0, 26)) === Number(value[26]);
	if (/^RF\d{2}[0-9A-Z]{1,21}$/.test(value)) return modulo97(value.slice(4) + value.slice(0, 4)) === 1;
	return false;
}

/**
 * The account and reference an invoice is paid to: with a QR-IBAN the QR reference, else the creditor reference
 * with the IBAN, else nothing (no valid account yet).
 */
export function paymentDetails(
	tenant: { iban: string; qrIban: string },
	invoiceNumber: string,
): { iban: string; reference: PaymentReference | null } | null {
	if (invoiceNumber && isQrIban(tenant.qrIban))
		return { iban: tenant.qrIban, reference: { type: 'QRR', value: qrReference(invoiceNumber) } };
	if (!isValidSwissIban(tenant.iban) || isQrIban(tenant.iban)) return null;
	return {
		iban: tenant.iban,
		reference: invoiceNumber ? { type: 'SCOR', value: creditorReference(invoiceNumber) } : null,
	};
}

/** Groups a reference for reading: QR references in fives from the right, creditor references in fours. */
export function formatReference(reference: PaymentReference): string {
	if (reference.type === 'SCOR') return reference.value.replace(/(.{4})/g, '$1 ').trim();
	const value = reference.value;
	const head = value.length % 5;
	return [value.slice(0, head), ...(value.slice(head).match(/.{5}/g) ?? [])].filter(Boolean).join(' ');
}

export function formatIban(iban: string): string {
	return compactIban(iban)
		.replace(/(.{4})/g, '$1 ')
		.trim();
}

function addressLines(party: { name: string; address: Address }) {
	return [
		'S',
		party.name,
		party.address.street,
		party.address.houseNumber ?? '',
		party.address.zip,
		party.address.city,
		'CH',
	];
}

/** Builds the Swiss Payment Standards payload (SPC 0200) for the QR code of a QR bill. */
export function qrBillPayload(input: QrBillInput): string {
	const emptyDebtor = ['', '', '', '', '', '', ''];
	return [
		'SPC',
		'0200',
		'1',
		compactIban(input.iban),
		...addressLines(input.creditor),
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		input.amount === null ? '' : (input.amount / 100).toFixed(2),
		'CHF',
		...(input.debtor ? addressLines(input.debtor) : emptyDebtor),
		input.reference?.type ?? 'NON',
		input.reference?.value ?? '',
		input.message,
		'EPD',
	].join('\n');
}
