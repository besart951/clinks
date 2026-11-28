import { expect, test } from '@playwright/test';

for (const path of ['/forgot-password', '/reset-password']) {
	test('opens the password form from an email using ' + path, async ({ page }) => {
		await page.goto('/#' + path + '?token=example%2Btoken');
		await expect(page.locator('input[autocomplete="new-password"]')).toBeVisible();
	});
}
