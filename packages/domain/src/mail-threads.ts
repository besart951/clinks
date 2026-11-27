import type { MailMessage } from './types.ts';

/** «Re:», «AW:», «Fwd:», «WG:» and the like, also stacked and numbered («Re[2]:»). */
const prefix = /^\s*(?:(?:re|aw|antw|fwd?|wg|tr)(?:\[\d+\])?\s*:\s*)+/i;

/** The subject without reply and forward prefixes, for grouping a conversation. */
export function threadSubject(subject: string): string {
	return subject.replace(prefix, '').replace(/\s+/g, ' ').trim();
}

/** The other side of a mail: who wrote it for received mail, who gets it for sent mail and drafts. */
export function counterpart(mail: Pick<MailMessage, 'folder' | 'from' | 'to'>): string {
	const outgoing = mail.folder === 'sent' || mail.folder === 'drafts';
	return (outgoing ? mail.to : [mail.from])
		.map((address) => address.trim().toLowerCase())
		.sort()
		.join(',');
}

/**
 * Mails of one conversation share this key: the same subject (without «Re:» …) with the same person. The mails
 * carry no reference to the one they answer, so this is the rule mail programs fall back to.
 */
export function threadKey(mail: Pick<MailMessage, 'folder' | 'from' | 'to' | 'subject'>): string {
	return `${threadSubject(mail.subject).toLowerCase()}|${counterpart(mail)}`;
}

/** Snoozed and still waiting at `now`: out of its folder. */
export function waiting(mail: Pick<MailMessage, 'snoozedUntil'>, now: Date): boolean {
	return !!mail.snoozedUntil && Date.parse(mail.snoozedUntil) > now.getTime();
}

/** When a mail counts as new: when it came, or when its snooze ended, whichever is later. */
export function arrivedAt(mail: Pick<MailMessage, 'sentAt' | 'snoozedUntil'>): string {
	return mail.snoozedUntil && mail.snoozedUntil > mail.sentAt ? mail.snoozedUntil : mail.sentAt;
}

export interface MailThread {
	key: string;
	/** Oldest first. */
	mails: MailMessage[];
	latest: MailMessage;
	unread: number;
}

/** Groups mails into conversations, newest conversation first. Drafts stay on their own. */
export function threads(mails: readonly MailMessage[]): MailThread[] {
	const groups = new Map<string, MailMessage[]>();
	for (const mail of mails) {
		const key = mail.folder === 'drafts' ? `draft|${mail.id}` : threadKey(mail);
		groups.set(key, [...(groups.get(key) ?? []), mail]);
	}
	return [...groups.entries()]
		.map(([key, group]) => {
			const sorted = [...group].sort((left, right) => left.sentAt.localeCompare(right.sentAt));
			return {
				key,
				mails: sorted,
				latest: sorted[sorted.length - 1],
				unread: sorted.filter((mail) => !mail.read).length,
			};
		})
		.sort((left, right) => latestArrival(right).localeCompare(latestArrival(left)));
}

/** A conversation whose snooze ended goes back on top, as if it had just come. */
function latestArrival(thread: MailThread): string {
	return thread.mails.map(arrivedAt).sort().at(-1)!;
}
