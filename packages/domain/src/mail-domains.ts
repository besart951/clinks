/**
 * A workspace's own sender domains: the DNS records it publishes so CLinks may send in its name (SPF through an
 * include CLinks controls, DKIM with a key per domain, a DMARC policy), and how a lookup is judged.
 */

export type DomainPurpose = 'business' | 'newsletter';
export type SenderKind = 'business' | 'personal' | 'newsletter';
export type DomainRecord = 'spf' | 'dkim' | 'dmarc';

export interface ExpectedRecord {
	record: DomainRecord;
	type: 'TXT';
	host: string;
	value: string;
}

export interface RecordCheck {
	record: DomainRecord;
	ok: boolean;
	/** What DNS answered, for the person comparing; null when nothing was there. */
	found: string | null;
}

/** Lower case, without a trailing dot or a leading `@`; null when it is not a host name. */
export function normalizeDomain(input: string): string | null {
	const domain = input.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
	return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain) ? domain : null;
}

/** Business and personal senders use a business domain; newsletters only their own. */
export function senderFits(kind: SenderKind, purpose: DomainPurpose) {
	return kind === 'newsletter' ? purpose === 'newsletter' : purpose === 'business';
}

export function expectedRecords(
	domain: string,
	dkim: { selector: string; publicKey: string },
	spfInclude: string,
): ExpectedRecord[] {
	return [
		{ record: 'spf', type: 'TXT', host: domain, value: `v=spf1 include:${spfInclude} ~all` },
		{ record: 'dkim', type: 'TXT', host: `${dkim.selector}._domainkey.${domain}`, value: dkimValue(dkim.publicKey) },
		{ record: 'dmarc', type: 'TXT', host: `_dmarc.${domain}`, value: 'v=DMARC1; p=none' },
	];
}

export function dkimValue(publicKey: string) {
	return `v=DKIM1; k=rsa; p=${publicKey}`;
}

/**
 * Judges what DNS answered. SPF: an existing `v=spf1` record only needs the include added. DKIM: the published key
 * must be ours. DMARC: any policy counts; `p=none` is a fine start.
 */
export function checkRecords(
	expected: readonly ExpectedRecord[],
	answers: (host: string) => readonly string[],
	spfInclude: string,
): RecordCheck[] {
	return expected.map(({ record, host, value }) => {
		const texts = answers(host);
		const pick = (test: (text: string) => boolean) => texts.find(test) ?? null;
		switch (record) {
			case 'spf': {
				const spf = pick((text) => /^v=spf1\b/i.test(text));
				return { record, ok: !!spf && spf.split(/\s+/).includes(`include:${spfInclude}`), found: spf };
			}
			case 'dkim': {
				const dkim = pick((text) => /\bp=/.test(text));
				const key = (text: string) => /\bp=([A-Za-z0-9+/=]+)/.exec(text.replace(/\s+/g, ''))?.[1];
				return { record, ok: !!dkim && key(dkim) === key(value), found: dkim };
			}
			case 'dmarc': {
				const dmarc = pick((text) => /^v=DMARC1\b/i.test(text));
				return { record, ok: !!dmarc, found: dmarc };
			}
		}
	});
}

export function domainVerified(checks: readonly RecordCheck[]) {
	return checks.length > 0 && checks.every((check) => check.ok);
}
