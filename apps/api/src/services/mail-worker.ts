import { inScope, type Tx } from '@clinks/db/scope';
import type { OutboxAttachment } from '@clinks/db/schema';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { isPermanentFailure, type MailAttachment } from '../mailer.ts';
import type { Services } from './context.ts';
import { documentBytes } from './files.ts';

/** Minutes to wait before the 2nd, 3rd … attempt; after the last one the mail is marked failed. */
const backoffMinutes = [1, 5, 30, 120, 360];

export interface MailWorkerOptions {
	/** Mails claimed per round. */
	batch?: number;
	/** At most this many mails a second, across workspaces (`MAIL_RATE_PER_SECOND`). */
	ratePerSecond?: number;
}

/**
 * Sends what the outbox holds. Claims due rows of `auth.mail_queue` (skipping rows another worker holds), then sends
 * each mail in its workspace's scope. Temporary failures are retried with backoff; a permanent refusal (5xx) or a
 * mismatching archived file ends the mail as failed.
 */
export class MailWorker {
	readonly #services: Services;
	readonly #batch: number;
	readonly #gap: number;
	#timer: ReturnType<typeof setInterval> | null = null;
	#running: Promise<number> | null = null;

	constructor(services: Services, options: MailWorkerOptions = {}) {
		this.#services = services;
		this.#batch = options.batch ?? 20;
		this.#gap = 1000 / (options.ratePerSecond ?? 5);
	}

	start(intervalMs = 2000) {
		this.#timer ??= setInterval(() => void this.runOnce().catch(logFailure), intervalMs);
		this.#timer.unref();
	}

	stop() {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
	}

	/** Sends one round of due mails; returns how many were handled. One round at a time per worker. */
	runOnce(): Promise<number> {
		this.#running ??= this.#round().finally(() => (this.#running = null));
		return this.#running;
	}

	/** Until nothing is due any more: for tests and for a graceful shutdown. */
	async drain() {
		while ((await this.runOnce()) > 0);
	}

	async #round() {
		const claimed = await this.#claim();
		for (const [index, row] of claimed.entries()) {
			if (index > 0 && this.#gap > 0) await new Promise((resolve) => setTimeout(resolve, this.#gap));
			await this.#send(row.outboxId, row.tenantId).catch(logFailure);
		}
		return claimed.length;
	}

	async #claim() {
		const now = this.#services.now();
		const { rows } = await sql<{ outboxId: string; tenantId: string }>`
			UPDATE auth.mail_queue SET locked_until = ${new Date(now.getTime() + 5 * 60_000)}
			WHERE outbox_id IN (
				SELECT outbox_id FROM auth.mail_queue
				WHERE due_at <= ${now} AND (locked_until IS NULL OR locked_until < ${now})
				ORDER BY due_at LIMIT ${this.#batch}
				FOR UPDATE SKIP LOCKED
			)
			RETURNING outbox_id, tenant_id`.execute(this.#services.db);
		return rows;
	}

	async #send(outboxId: string, tenantId: string) {
		await inScope(this.#services.db, { tenantId, userId: null }, async (tx) => {
			const mail = await tx.selectFrom('mailOutbox').selectAll().where('id', '=', outboxId).executeTakeFirst();
			if (!mail || mail.status !== 'queued') return dequeue(tx, outboxId);
			const messageId = `<${mail.id}@clinks.ch>`;
			try {
				await this.#services.mailer.send({
					to: mail.recipient,
					subject: mail.subject,
					text: mail.textBody,
					html: mail.htmlBody,
					fromName: mail.fromName,
					replyTo: mail.replyTo ?? undefined,
					headers: mail.headers,
					messageId,
					attachments: await Promise.all(mail.attachments.map((attachment) => this.#attachment(tx, attachment))),
				});
			} catch (error) {
				return this.#failed(tx, outboxId, mail.attempts + 1, error);
			}
			await tx
				.updateTable('mailOutbox')
				.set({ attempts: mail.attempts + 1, status: 'sent', sentAt: this.#services.now(), error: null, messageId })
				.where('id', '=', outboxId)
				.execute();
			await dequeue(tx, outboxId);
		});
	}

	/** Records the failure; a temporary one goes back into the queue after its backoff. */
	async #failed(tx: Tx, outboxId: string, attempts: number, error: unknown) {
		const final = isPermanentFailure(error) || error instanceof ArchiveMismatch || attempts > backoffMinutes.length;
		await tx
			.updateTable('mailOutbox')
			.set({ attempts, status: final ? 'failed' : 'queued', error: describe(error) })
			.where('id', '=', outboxId)
			.execute();
		if (final) return dequeue(tx, outboxId);
		const dueAt = new Date(this.#services.now().getTime() + backoffMinutes[attempts - 1] * 60_000);
		await tx.updateTable('auth.mailQueue').set({ dueAt, lockedUntil: null }).where('outboxId', '=', outboxId).execute();
	}

	async #attachment(tx: Tx, attachment: OutboxAttachment): Promise<MailAttachment> {
		const content = await documentBytes(tx, this.#services, attachment.documentId);
		if (attachment.sha256 && createHash('sha256').update(content).digest('hex') !== attachment.sha256)
			throw new ArchiveMismatch();
		return { filename: attachment.filename, content, contentType: attachment.contentType };
	}
}

function dequeue(tx: Tx, outboxId: string) {
	return tx.deleteFrom('auth.mailQueue').where('outboxId', '=', outboxId).execute();
}

/** The archived file no longer matches the checksum recorded when it was archived: never send it. */
class ArchiveMismatch extends Error {
	constructor() {
		super('archived file does not match its checksum');
		this.name = 'ArchiveMismatch';
	}
}

function describe(error: unknown) {
	const code = (error as { responseCode?: unknown }).responseCode;
	const name = error instanceof Error ? error.name : 'Error';
	return typeof code === 'number' ? `${name} ${code}` : name;
}

function logFailure(error: unknown) {
	console.error(JSON.stringify({ event: 'mail.worker_failed', errorType: (error as Error)?.name ?? 'Error' }));
}
