import { describe, expect, it } from 'vitest';
import { emptyQuery, matchesMailQuery, parseMailQuery } from '../src/mail-query.ts';
import { snoozeChoices } from '../src/snooze.ts';
import { arrivedAt, threads, waiting } from '../src/mail-threads.ts';
import type { MailMessage } from '../src/types.ts';

const mail = (partial: Partial<Omit<MailMessage, 'id'>> & { id?: string } = {}) =>
	({
		id: 'm',
		folder: 'inbox',
		from: 'lea@example.ch',
		fromName: 'Lea Muster',
		to: ['praxis@example.ch'],
		subject: 'Termin am Montag',
		body: 'Kann ich verschieben?',
		sentAt: '2026-11-20T08:00:00Z',
		read: true,
		starred: false,
		...partial,
	}) as unknown as MailMessage;

describe('mail search', () => {
	it('reads filters in German and English, with quotes', () => {
		expect(parseMailQuery('von:"Lea Muster" is:unread nach:2026-11-01 termin')).toEqual({
			words: ['termin'],
			from: ['lea muster'],
			to: [],
			unread: true,
			starred: false,
			after: '2026-11-01',
			before: null,
		});
		expect(parseMailQuery('an:praxis ist:markiert vor:2026-12-31').to).toEqual(['praxis']);
		expect(emptyQuery(parseMailQuery('  '))).toBe(true);
	});

	it('matches every part', () => {
		expect(matchesMailQuery(mail(), parseMailQuery('von:lea verschieben'))).toBe(true);
		expect(matchesMailQuery(mail(), parseMailQuery('ist:ungelesen'))).toBe(false);
		expect(matchesMailQuery(mail(), parseMailQuery('vor:2026-11-19'))).toBe(false);
		expect(matchesMailQuery(mail({ starred: true }), parseMailQuery('ist:markiert an:praxis'))).toBe(true);
	});
});

describe('snoozing', () => {
	it('offers this evening only before 17:00, then tomorrow and next Monday at 08:00', () => {
		const friday = new Date(2026, 10, 27, 10, 30);
		expect(snoozeChoices(friday).map(({ choice, until }) => [choice, until.getDate(), until.getHours()])).toEqual([
			['evening', 27, 18],
			['tomorrow', 28, 8],
			['monday', 30, 8],
		]);
		const mondayLate = new Date(2026, 10, 30, 19, 0);
		expect(snoozeChoices(mondayLate).map(({ choice, until }) => [choice, until.getDate()])).toEqual([
			['tomorrow', 1],
			['monday', 7],
		]);
	});

	it('keeps a mail out until then and puts its conversation back on top afterwards', () => {
		const now = new Date('2026-11-25T12:00:00Z');
		expect(waiting(mail({ snoozedUntil: '2026-11-26T08:00:00Z' }), now)).toBe(true);
		const back = mail({ id: 'a', snoozedUntil: '2026-11-24T08:00:00Z' });
		expect(arrivedAt(back)).toBe('2026-11-24T08:00:00Z');
		const newer = mail({ id: 'b', from: 'max@example.ch', sentAt: '2026-11-22T08:00:00Z' });
		expect(threads([newer, back]).map((thread) => thread.latest.id)).toEqual(['a', 'b']);
	});
});
