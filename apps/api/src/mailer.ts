import nodemailer from 'nodemailer';

export interface MailAttachment {
	cid?: string;
	filename: string;
	content: Uint8Array;
	contentType: string;
}

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
	/** The same content as HTML (see @clinks/mail-layout); the text part is always sent too. */
	html?: string;
	/** Display name in place of the platform's («Spitex Seeland» instead of «CLinks»); the address stays ours. */
	fromName?: string;
	/** A workspace's own verified address (relay only), signed with its domain's DKIM key. */
	from?: { name: string; address: string };
	dkim?: { domainName: string; keySelector: string; privateKey: string };
	replyTo?: string;
	attachments?: MailAttachment[];
	/** `<id@host>`; set by the outbox so bounces and replies can be traced to the mail. */
	messageId?: string;
	headers?: Record<string, string>;
	/** The envelope sender: bounces go there (a per-mail address on the inbound domain). */
	returnPath?: string;
}

export interface Mailer {
	send(message: MailMessage): Promise<void>;
}

/** SMTP: Mailpit locally, Infomaniak's mail service in production. */
export function smtpMailer(url: string, from: string): Mailer {
	const transport = nodemailer.createTransport(url);
	return {
		async send({ fromName, from: own, attachments, returnPath, ...message }) {
			await transport.sendMail({
				...message,
				envelope: returnPath ? { from: returnPath, to: message.to } : undefined,
				from: own ?? (fromName ? { name: fromName, address: addressOf(from) } : from),
				attachments: attachments?.map((file) => ({ ...file, content: Buffer.from(file.content) })),
			});
		},
	};
}

/** Refused by the receiving server for good (5xx): retrying would not help. */
export function isPermanentFailure(error: unknown) {
	const code = (error as { responseCode?: unknown }).responseCode;
	return typeof code === 'number' && code >= 500 && code < 600;
}

/** The bare address of `Name <address>` or of a plain address. */
export function addressOf(from: string) {
	return /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
}

/** Keeps mails in memory, for tests. */
export class MemoryMailer implements Mailer {
	readonly sent: MailMessage[] = [];

	async send(message: MailMessage) {
		this.sent.push(message);
	}

	last(to: string): MailMessage {
		const message = this.sent.findLast((candidate) => candidate.to === to);
		if (!message) throw new Error(`no mail to ${to}`);
		return message;
	}
}
