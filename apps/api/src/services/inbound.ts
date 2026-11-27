import { inScope, type Tx } from '@clinks/db/scope';
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import { uuid } from '../crypto.ts';
import type { Services } from './context.ts';
import { storeFile } from './files.ts';
import { readBounceAddress, settle } from './outbox.ts';

/** One raw message in the catch-all mailbox. */
export interface InboundMessage {
	id: string;
	raw: Buffer;
}

/** One round of reading the mailbox: what is there now, and the connection to remove handled messages. */
export interface InboundBatch {
	messages: InboundMessage[];
	/** Handled (filed, counted as bounce, or not ours): it leaves the mailbox. */
	remove(id: string): Promise<void>;
	close(): Promise<void>;
}

/** The catch-all mailbox: IMAP in production, Mailpit's API in development, memory in tests. */
export interface InboundSource {
	batch(limit: number): Promise<InboundBatch>;
}

/** Larger messages are not filed; their senders use a file transfer instead. */
const maxMessageBytes = 10 * 1024 * 1024;

/**
 * Reads the catch-all mailbox: bounces mark their mail undeliverable and block the address after a hard bounce;
 * mail to a filing address is filed at the matching contact. Everything else is dropped. Each message is handled
 * once and removed.
 */
export class InboundMail {
	readonly #services: Services;
	readonly #source: InboundSource;
	readonly #domain: string;

	constructor(services: Services, source: InboundSource, domain: string) {
		this.#services = services;
		this.#source = source;
		this.#domain = domain.toLowerCase();
	}

	/** Handles up to 50 messages; returns how many. A message that fails stays for the next round. */
	async poll(): Promise<number> {
		const batch = await this.#source.batch(50);
		try {
			for (const message of batch.messages) {
				if (message.raw.length <= maxMessageBytes) await this.#handle(await simpleParser(message.raw));
				await batch.remove(message.id);
			}
			return batch.messages.length;
		} finally {
			await batch.close();
		}
	}

	async #handle(parsed: ParsedMail) {
		for (const local of this.#localParts(parsed)) {
			const bounce = readBounceAddress(local);
			if (bounce) return this.#bounce(bounce.outboxId, bounce.tenantId, parsed);
			const filing = await this.#services.db
				.selectFrom('auth.mailInboundAddresses')
				.select(['tenantId', 'createdBy'])
				.where('localPart', '=', local)
				.where('active', '=', true)
				.executeTakeFirst();
			if (filing) return this.#file(filing.tenantId, filing.createdBy, parsed);
		}
	}

	/** Local parts of the recipients on the inbound domain, envelope headers first. */
	#localParts(parsed: ParsedMail) {
		// mailparser hands these over parsed as addresses; some servers send them in forms it leaves as text.
		const header = (name: string) => {
			const value = parsed.headers.get(name);
			if (typeof value === 'string') return [value];
			return value && typeof value === 'object' && 'value' in value ? addressesOf(value as AddressObject) : [];
		};
		const addresses = [
			...header('delivered-to'),
			...header('x-original-to'),
			...addressesOf(parsed.to),
			...addressesOf(parsed.cc),
		];
		return [
			...new Set(
				addresses
					.map((address) => address.toLowerCase().trim())
					.filter((address) => address.endsWith(`@${this.#domain}`))
					.map((address) => address.slice(0, address.indexOf('@'))),
			),
		];
	}

	/** A hard bounce (5.x.x) blocks the address for all mail of the workspace; a soft one only marks the mail. */
	async #bounce(outboxId: string, tenantId: string, parsed: ParsedMail) {
		const hard = isHardBounce(
			[parsed.text ?? '', ...parsed.attachments.map((file) => file.content.toString('utf8'))].join('\n'),
		);
		await inScope(this.#services.db, { tenantId, userId: null }, async (tx) => {
			const mail = await tx
				.selectFrom('mailOutbox')
				.select(['recipient'])
				.where('id', '=', outboxId)
				.executeTakeFirst();
			if (!mail || !hard) return;
			await settle(tx, outboxId, 'bounced', this.#services.now());
			await tx
				.insertInto('mailSuppressions')
				.values({ tenantId, address: mail.recipient.toLowerCase(), scope: 'all', reason: 'bounced' })
				.onConflict((conflict) => conflict.doNothing())
				.execute();
		});
	}

	/**
	 * Files a copy: written by someone of the workspace (BCC on their own mail) → «Gesendet» at the recipient's
	 * contact; else → «Posteingang» at the sender's contact. Attachments become documents at that contact.
	 */
	async #file(tenantId: string, createdBy: string, parsed: ParsedMail) {
		const from = addressesOf(parsed.from)[0]?.toLowerCase() ?? '';
		const to = [...addressesOf(parsed.to), ...addressesOf(parsed.cc)]
			.map((address) => address.toLowerCase())
			.filter((address) => !address.endsWith(`@${this.#domain}`));
		const messageId = parsed.messageId ?? `<${uuid()}@${this.#domain}>`;
		await inScope(this.#services.db, { tenantId, userId: createdBy }, async (tx) => {
			const known = await tx.selectFrom('mails').select('id').where('messageId', '=', messageId).executeTakeFirst();
			if (known) return;
			const own = await ownAddresses(tx, tenantId);
			const outgoing = own.has(from);
			const contactId = await contactFor(tx, outgoing ? to : [from]);
			const now = this.#services.now();
			await tx
				.insertInto('mails')
				.values({
					id: uuid(),
					tenantId,
					folder: outgoing ? 'sent' : 'inbox',
					sender: from,
					fromName: parsed.from?.value[0]?.name || from,
					recipients: JSON.stringify(to),
					subject: (parsed.subject ?? '').slice(0, 500),
					body: (parsed.text ?? '').slice(0, 100_000),
					sentAt: parsed.date ?? now,
					isRead: outgoing,
					starred: false,
					contactId,
					messageId,
					delivery: null,
					createdAt: now,
					updatedAt: now,
				})
				.execute();
			for (const file of parsed.attachments.filter((attachment) => attachment.contentDisposition === 'attachment'))
				await storeFile(
					tx,
					this.#services,
					{ tenantId, userId: createdBy },
					{
						name: file.filename ?? 'Anhang',
						folder: 'E-Mail-Ablage',
						bytes: new Uint8Array(file.content),
						type: file.contentType,
						targets: contactId ? [{ kind: 'contact', id: contactId }] : [],
						locked: false,
					},
				);
		});
	}
}

/**
 * A delivery status notification (RFC 3464) reports `Status: 5.x.x` for a permanent failure; plain-text bounces
 * without one count as hard when they name a 5.x.x code and no 4.x.x status.
 */
function isHardBounce(report: string) {
	if (/\bStatus:\s*5\.\d+\.\d+/i.test(report)) return true;
	return !/\bStatus:\s*4\./i.test(report) && /\b5\.\d\.\d\b/.test(report);
}

function addressesOf(field: AddressObject | AddressObject[] | undefined): string[] {
	const objects = Array.isArray(field) ? field : field ? [field] : [];
	return objects.flatMap((object) => object.value.map((entry) => entry.address ?? '').filter(Boolean));
}

/** The addresses of the workspace's people and senders: mail from them is their own, copied in by BCC. */
async function ownAddresses(tx: Tx, tenantId: string) {
	const people = await tx
		.selectFrom('memberships')
		.innerJoin('users', 'users.id', 'memberships.userId')
		.select('users.email')
		.where('memberships.tenantId', '=', tenantId)
		.where('memberships.status', '=', 'active')
		.execute();
	const senders = await tx.selectFrom('mailSenders').select('address').execute();
	return new Set([...people.map((row) => row.email), ...senders.map((row) => row.address)].map((a) => a.toLowerCase()));
}

async function contactFor(tx: Tx, addresses: string[]): Promise<string | null> {
	if (addresses.length === 0) return null;
	const row = await tx
		.selectFrom('contacts')
		.select('id')
		.where((eb) => eb(eb.fn('lower', ['email']), 'in', addresses))
		.executeTakeFirst();
	return row ? String(row.id) : null;
}
