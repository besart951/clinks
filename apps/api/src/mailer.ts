import nodemailer from 'nodemailer';

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
}

export interface Mailer {
	send(message: MailMessage): Promise<void>;
}

/** SMTP: Mailpit locally, Infomaniak's mail service in production. */
export function smtpMailer(url: string, from: string): Mailer {
	const transport = nodemailer.createTransport(url);
	return {
		async send(message) {
			await transport.sendMail({ from, ...message });
		},
	};
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
