import type { MailMessage } from './types.ts';

/**
 * A mail search as typed: words plus filters, in German or English — `von:lea`, `an:praxis`, `ist:ungelesen`,
 * `ist:markiert`, `nach:2026-11-01`, `vor:2026-12-01` (`from:`, `to:`, `is:unread`, `is:starred`, `after:`,
 * `before:`). Quotes keep spaces: `von:"Lea Muster"`.
 */
export interface MailQuery {
	words: string[];
	from: string[];
	to: string[];
	unread: boolean;
	starred: boolean;
	/** Calendar dates, inclusive. */
	after: string | null;
	before: string | null;
}

const filters: Record<string, keyof MailQuery | 'is'> = {
	von: 'from',
	from: 'from',
	an: 'to',
	to: 'to',
	ist: 'is',
	is: 'is',
	nach: 'after',
	after: 'after',
	vor: 'before',
	before: 'before',
};

const token = /(\w+):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g;

export function parseMailQuery(text: string): MailQuery {
	const query: MailQuery = { words: [], from: [], to: [], unread: false, starred: false, after: null, before: null };
	for (const match of text.matchAll(token)) {
		const [, name, quoted, plain, phrase, word] = match;
		const filter = name ? filters[name.toLowerCase()] : undefined;
		const value = (quoted ?? plain ?? '').toLowerCase();
		if (!filter) {
			const text = (phrase ?? word ?? match[0]).toLowerCase();
			if (text) query.words.push(text);
		} else if (filter === 'from' || filter === 'to') {
			if (value) query[filter].push(value);
		} else if (filter === 'is') {
			if (['ungelesen', 'unread'].includes(value)) query.unread = true;
			if (['markiert', 'starred', 'stern'].includes(value)) query.starred = true;
		} else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) query[filter as 'after' | 'before'] = value;
	}
	return query;
}

/** Whether the mail matches every part of the query; words are looked for in subject, sender and text. */
export function matchesMailQuery(mail: MailMessage, query: MailQuery): boolean {
	const text = `${mail.subject} ${mail.fromName} ${mail.from} ${mail.to.join(' ')} ${mail.body}`.toLowerCase();
	const sender = `${mail.fromName} ${mail.from}`.toLowerCase();
	const recipients = mail.to.join(' ').toLowerCase();
	const day = mail.sentAt.slice(0, 10);
	return (
		query.words.every((word) => text.includes(word)) &&
		query.from.every((part) => sender.includes(part)) &&
		query.to.every((part) => recipients.includes(part)) &&
		(!query.unread || !mail.read) &&
		(!query.starred || mail.starred) &&
		(!query.after || day >= query.after) &&
		(!query.before || day <= query.before)
	);
}

/** Whether the search uses no filter or words at all. */
export function emptyQuery(query: MailQuery): boolean {
	return (
		query.words.length + query.from.length + query.to.length === 0 &&
		!query.unread &&
		!query.starred &&
		!query.after &&
		!query.before
	);
}
