import type { Address } from './types';

/** «57», «12a», «3-5», «14/2». */
const houseNumber = /^(.*\S)\s+(\d+\s?[a-z]?(?:[-/]\d+[a-z]?)?)$/iu;

/**
 * Splits «Bahnhofstrasse 57» into street and house number, e.g. after the browser autofills the whole line into
 * the street field. Anything else stays the street.
 */
export function splitStreet(line: string): Pick<Address, 'street' | 'houseNumber'> {
	const match = houseNumber.exec(line.trim());
	return match
		? { street: match[1], houseNumber: match[2].replace(/\s/gu, '') }
		: { street: line.trim(), houseNumber: '' };
}

/** «Bahnhofstrasse 57». Older records may lack the house number and carry it in the street. */
export function streetLine(address: Address): string {
	return [address.street, address.houseNumber].filter(Boolean).join(' ');
}

/** «Bahnhofstrasse 57, 3255 Rapperswil BE». */
export function formatAddress(address: Address): string {
	return [streetLine(address), `${address.zip} ${address.city}`.trim()].filter(Boolean).join(', ');
}

export const emptyAddress = (): Address => ({ street: '', houseNumber: '', zip: '', city: '' });
