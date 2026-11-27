import { describe, expect, it } from 'vitest';
import { threadKey, threadSubject, threads } from '../src/mail-threads.ts';
import type { MailMessage } from '../src/types.ts';

function mail(partial: Omit<Partial<MailMessage>, 'id'> & { id?: string }): MailMessage {
	return {
		id: 'm',
		tenantId: 't',
		folder: 'inbox',
		from: 'lea@example.ch',
		fromName: 'Lea',
		to: ['praxis@example.ch'],
		subject: 'Termin',
		body: '',
		sentAt: '2026-11-01T08:00:00Z',
		read: true,
		starred: false,
		contactId: null,
		messageId: null,
		delivery: null,
		revision: 1,
		createdAt: '2026-11-01T08:00:00Z',
		updatedAt: '2026-11-01T08:00:00Z',
		...partial,
	} as unknown as MailMessage;
}

describe('mail threads', () => {
	it('strips stacked reply and forward prefixes in German and English', () => {
		expect(threadSubject('AW: Re[2]: WG:  Termin  am Montag')).toBe('Termin am Montag');
		expect(threadSubject('Fwd: Rechnung')).toBe('Rechnung');
	});

	it('puts a received mail and the reply sent to the same person into one conversation', () => {
		const received = mail({ id: 'a' });
		const reply = mail({
			id: 'b',
			folder: 'sent',
			from: 'praxis@example.ch',
			to: ['Lea@example.ch'],
			subject: 'Re: Termin',
		});
		const other = mail({ id: 'c', from: 'max@example.ch' });
		expect(threadKey(received)).toBe(threadKey(reply));
		expect(threadKey(received)).not.toBe(threadKey(other));
	});

	it('orders conversations by their newest mail and counts unread ones', () => {
		const result = threads([
			mail({ id: 'a', sentAt: '2026-11-01T08:00:00Z', read: false }),
			mail({ id: 'b', subject: 'AW: Termin', sentAt: '2026-11-03T08:00:00Z', read: false }),
			mail({ id: 'c', from: 'max@example.ch', sentAt: '2026-11-02T08:00:00Z' }),
			mail({ id: 'd', folder: 'drafts', subject: 'Termin', to: ['lea@example.ch'] }),
		]);
		expect(result.map((thread) => thread.latest.id)).toEqual(['b', 'c', 'd']);
		expect(result[0].mails.map((entry) => entry.id)).toEqual(['a', 'b']);
		expect(result[0].unread).toBe(2);
	});
});
