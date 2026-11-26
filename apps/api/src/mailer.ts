import nodemailer from 'nodemailer';

export interface MailAttachment {
	filename: string;
	content: Uint8Array;
	contentType: string;
}

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
	/** Display name in place of the platform's («Spitex Seeland» instead of «CLinks»); the address stays ours. */
	fromName?: string;
	replyTo?: string;
	attachments?: MailAttachment[];
}

export interface Mailer {
	send(message: MailMessage): Promise<void>;
}

/** SMTP: Mailpit locally, Infomaniak's mail service in production. */
export function smtpMailer(url: string, from: string): Mailer {
	const transport = nodemailer.createTransport(url);
	return {
		async send({ fromName, attachments, ...message }) {
			await transport.sendMail({
				...message,
				from: fromName ? { name: fromName, address: addressOf(from) } : from,
				attachments: attachments?.map((file) => ({ ...file, content: Buffer.from(file.content) })),
			});
		},
	};
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
