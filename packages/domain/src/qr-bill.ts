import type { Address, Rappen } from './types.ts';

export interface QrBillInput {
	iban: string;
	creditor: { name: string; address: Address };
	debtor: { name: string; address: Address } | null;
	amount: Rappen | null;
	message: string;
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
		'NON',
		'',
		input.message,
		'EPD',
	].join('\n');
}
