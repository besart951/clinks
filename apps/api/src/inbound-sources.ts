import { ImapFlow } from 'imapflow';
import type { InboundBatch, InboundMessage, InboundSource } from './services/inbound.ts';

/** The catch-all mailbox over IMAP (`imaps://user:password@host:993`); handled messages are deleted. */
export function imapSource(url: string): InboundSource {
	const target = new URL(url);
	return {
		async batch(limit) {
			const client = new ImapFlow({
				host: target.hostname,
				port: Number(target.port || 993),
				secure: target.protocol === 'imaps:',
				auth: { user: decodeURIComponent(target.username), pass: decodeURIComponent(target.password) },
				logger: false,
			});
			await client.connect();
			const lock = await client.getMailboxLock('INBOX');
			const messages: InboundMessage[] = [];
			// Read first, act after: IMAP takes no other command while a fetch runs.
			for await (const message of client.fetch('1:*', { uid: true, source: true }, { uid: false })) {
				if (message.source) messages.push({ id: String(message.uid), raw: message.source });
				if (messages.length >= limit) break;
			}
			return {
				messages,
				remove: async (id) => {
					await client.messageDelete(id, { uid: true });
				},
				close: async () => {
					lock.release();
					await client.logout();
				},
			};
		},
	};
}

/** Development: Mailpit catches all mail; only messages to the inbound domain are read and removed. */
export function mailpitSource(baseUrl: string, domain: string): InboundSource {
	const api = baseUrl.replace(/\/$/, '');
	return {
		async batch(limit) {
			const search = await fetch(`${api}/api/v1/search?query=${encodeURIComponent(`to:"@${domain}"`)}&limit=${limit}`);
			const { messages } = (await search.json()) as { messages: { ID: string }[] };
			const raw = await Promise.all(
				messages.map(async ({ ID }) => ({
					id: ID,
					raw: Buffer.from(await (await fetch(`${api}/api/v1/message/${ID}/raw`)).arrayBuffer()),
				})),
			);
			return {
				messages: raw,
				remove: async (id) => {
					await fetch(`${api}/api/v1/messages`, {
						method: 'DELETE',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ IDs: [id] }),
					});
				},
				close: async () => {},
			};
		},
	};
}

/** Tests: messages put in by hand. */
export class MemoryInbound implements InboundSource {
	readonly #messages = new Map<string, Buffer>();
	#next = 1;

	deliver(raw: Buffer | string) {
		this.#messages.set(String(this.#next++), Buffer.from(raw));
	}

	get size() {
		return this.#messages.size;
	}

	async batch(limit: number): Promise<InboundBatch> {
		return {
			messages: [...this.#messages].slice(0, limit).map(([id, raw]) => ({ id, raw })),
			remove: async (id) => void this.#messages.delete(id),
			close: async () => {},
		};
	}
}
