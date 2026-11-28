import { expect, test } from '@playwright/test';

test('shows and hides the entered password without submitting the form', async ({ page }) => {
	await page.goto('/#/login');
	const field = page.getByLabel('Passwort', { exact: true });
	const toggle = page.getByRole('button', { name: 'Passwort anzeigen' });
	await expect(field).toHaveAttribute('type', 'password');
	await field.fill('Beispiel-123!');
	await toggle.click();
	await expect(field).toHaveAttribute('type', 'text');
	const hide = page.getByRole('button', { name: 'Passwort verbergen' });
	await expect(hide).toHaveText('Passwort verbergen');
	await hide.focus();
	await page.keyboard.press('Space');
	await expect(field).toHaveAttribute('type', 'password');
	await expect(field).toHaveValue('Beispiel-123!');
	await expect(toggle).toHaveText('Passwort anzeigen');
	await expect(page).toHaveURL(/#\/login$/);
});
