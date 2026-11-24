import { expect, test, type Page } from '@playwright/test';

/** The build ships a Content Security Policy; anything it blocks fails the test. */
export function failOnCspViolations() {
	const blocked = new WeakMap<Page, string[]>();
	test.beforeEach(({ page }) => {
		const messages: string[] = [];
		blocked.set(page, messages);
		page.on('console', (message) => {
			if (/Content Security Policy/i.test(message.text())) messages.push(message.text());
		});
	});
	test.afterEach(({ page }) => {
		expect(blocked.get(page)).toEqual([]);
	});
}
