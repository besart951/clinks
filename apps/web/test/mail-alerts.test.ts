import { describe, expect, it } from 'vitest';
import { announces } from '../src/lib/features/mail/mail-alerts.svelte';
import { pullOffset, pullThreshold } from '../src/lib/features/list/pull-refresh.svelte';

describe('mail alerts per mailbox', () => {
	it('announces by the chosen mailbox the mail went to, else by «all other addresses»', () => {
		const choice = { 'praxis@example.ch': false, 'besi@example.ch': true };
		expect(announces(choice, ['Praxis@example.ch'])).toBe(false);
		expect(announces(choice, ['besi@example.ch'])).toBe(true);
		expect(announces(choice, ['info@example.ch'])).toBe(true);
		expect(announces({ ...choice, other: false }, ['info@example.ch'])).toBe(false);
	});
});

describe('pull to refresh', () => {
	it('follows the finger with resistance and stops at twice the threshold', () => {
		expect(pullOffset(-20)).toBe(0);
		expect(pullOffset(100)).toBe(50);
		expect(pullOffset(1000)).toBe(pullThreshold * 2);
	});
});
