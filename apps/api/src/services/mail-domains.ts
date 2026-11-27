import type { Tx } from '@clinks/db/scope';
import type { DomainCheck } from '@clinks/db/schema';
import { checkRecords, domainVerified, expectedRecords } from '@clinks/domain/mail-domains';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import type { Services } from './context.ts';

/** How long a verification holds before the worker looks again before sending. */
export const recheckAfterMs = 24 * 60 * 60_000;

export function spfInclude(services: Services) {
	return services.config.MAIL_SPF_INCLUDE ?? '_spf.clinks.ch';
}

/** A fresh DKIM key: the public half (base64 DER) goes into DNS, the private half (PEM) stays sealed in `auth`. */
export function dkimKey() {
	const { publicKey, privateKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'der' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	// Random per domain: two workspaces adding the same domain never share a record.
	return { selector: `clinks-${randomBytes(3).toString('hex')}`, publicKey: publicKey.toString('base64'), privateKey };
}

/** The sealing context binds a DKIM key to its domain row, so a copied ciphertext opens nowhere else. */
export function keyContext(domainId: string) {
	return `dkim:${domainId}`;
}

/** Looks the domain's records up and stores the result; returns whether it is verified now. */
export async function verifyDomain(
	tx: Tx,
	services: Services,
	domain: { id: string; domain: string; selector: string; dkimPublicKey: string; status: string },
): Promise<boolean> {
	const include = spfInclude(services);
	const expected = expectedRecords(
		domain.domain,
		{ selector: domain.selector, publicKey: domain.dkimPublicKey },
		include,
	);
	const lookup = services.resolveTxt ?? resolveTxt;
	const answers = new Map<string, string[]>();
	for (const { host } of expected)
		answers.set(
			host,
			(await lookup(host).catch(() => [] as string[][])).map((parts) => parts.join('')),
		);
	const checks: DomainCheck[] = checkRecords(expected, (host) => answers.get(host) ?? [], include);
	const verified = domainVerified(checks);
	// Once verified, a later failure is «failing» (it used to work) rather than «pending».
	const status = verified ? 'verified' : domain.status === 'pending' ? 'pending' : 'failing';
	await tx
		.updateTable('mailDomains')
		.set({ checks: JSON.stringify(checks) as never, status, checkedAt: services.now() })
		.where('id', '=', domain.id)
		.execute();
	return verified;
}
