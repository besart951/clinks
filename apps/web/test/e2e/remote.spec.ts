import { expect, test } from '@playwright/test';

const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** The six-digit code from the newest mail to `email` in Mailpit. */
async function codeFor(email: string): Promise<string> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
		const { messages } = (await response.json()) as { messages: { Snippet: string }[] };
		const code = messages[0] && /\b(\d{6})\b/.exec(messages[0].Snippet)?.[1];
		if (code) return code;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`no code mailed to ${email}`);
}

test('signs up against the API, onboards, survives a reload and signs out', async ({ page }) => {
	const email = `e2e-${Date.now()}@example.ch`;
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.goto('/#/signup');
	await page.getByLabel('Vorname').fill('Erika');
	await page.getByLabel('Nachname').fill('Ende');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill('correct-horse-battery');
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(page).toHaveURL(/#\/verify-email/);

	await page.getByLabel('Code').fill(await codeFor(email));
	await page.getByRole('button', { name: 'Bestätigen' }).click();
	await expect(page).toHaveURL(/#\/onboarding/);

	await page.getByLabel('Mandantenname').fill('E2E Praxis');
	for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Weiter' }).click();
	await page.getByRole('button', { name: 'Arbeitsbereich erstellen' }).click();
	await expect(page).toHaveURL(/#\/dashboard/);
	await expect(page.getByText('E2E Praxis').first()).toBeVisible();

	expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('eyJ'); // no token in storage
	await page.reload();
	await expect(page).toHaveURL(/#\/dashboard/);
	await expect(page.getByText('E2E Praxis').first()).toBeVisible();

	await page.getByRole('button', { name: 'Kontomenü' }).click();
	await page.getByRole('menuitem', { name: 'Abmelden' }).click();
	await expect(page).toHaveURL(/#\/login/);
	await page.reload();
	await expect(page).toHaveURL(/#\/login/);
});
