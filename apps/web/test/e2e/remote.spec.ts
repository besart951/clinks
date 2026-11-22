import { expect, test, type Browser, type Page } from '@playwright/test';

const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const password = 'correct-horse-battery';

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

async function signUpAndOnboard(page: Page, email: string, tenant: string) {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page).toHaveURL(/#\/login/); // the redirect of a signed-out visit has settled
	await page.goto('/#/signup');
	await page.getByLabel('Vorname').fill('Erika');
	await page.getByLabel('Nachname').fill('Ende');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(page).toHaveURL(/#\/verify-email/);
	await page.getByLabel('Code').fill(await codeFor(email));
	await page.getByRole('button', { name: 'Bestätigen' }).click();
	await expect(page).toHaveURL(/#\/onboarding/);
	await page.getByLabel('Mandantenname').fill(tenant);
	for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Weiter' }).click();
	await page.getByRole('button', { name: 'Arbeitsbereich erstellen' }).click();
	await expect(page).toHaveURL(/#\/dashboard/);
}

/** The same account on another device: a fresh browser context. */
async function secondDevice(browser: Browser, email: string): Promise<Page> {
	const page = await (await browser.newContext()).newPage();
	await page.goto('/#/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page).toHaveURL(/#\/dashboard/);
	return page;
}

async function openNewContact(page: Page) {
	await page.goto('/#/contacts?new=1');
	await expect(page.getByLabel('Vorname')).toBeVisible();
}

async function saveContact(page: Page, firstName: string, lastName: string) {
	await page.getByLabel('Vorname').fill(firstName);
	await page.getByLabel('Nachname').fill(lastName);
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('heading', { level: 1, name: `${firstName} ${lastName}` })).toBeVisible();
}

test('signs up against the API, onboards, survives a reload and signs out', async ({ page }) => {
	await signUpAndOnboard(page, `e2e-${Date.now()}@example.ch`, 'E2E Praxis');
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

test('syncs contacts between devices, also after working offline', async ({ page, browser, context }) => {
	const email = `sync-${Date.now()}@example.ch`;
	await signUpAndOnboard(page, email, 'Sync Praxis');

	// Demo contacts were written locally and uploaded.
	await page.goto('/#/contacts');
	await expect(
		page
			.getByRole('link')
			.filter({ hasText: /\w+ \w+/ })
			.first(),
	).toBeVisible();

	await openNewContact(page);
	await saveContact(page, 'Lea', 'Synchron');
	const laptop = await secondDevice(browser, email);
	await laptop.goto('/#/contacts');
	await laptop.getByLabel('Name, E-Mail, Telefon, Ort …').fill('Synchron');
	await expect(laptop.getByRole('link', { name: 'Lea Synchron' })).toBeVisible({ timeout: 15_000 });

	// Offline: the write stays in the local queue and goes up once the connection is back. The form is
	// opened before, because loading a page offline needs the service worker that comes with the PWA.
	await openNewContact(page);
	await context.setOffline(true);
	await saveContact(page, 'Otto', 'Offline');
	await expect(page.getByRole('status', { name: /Sync/ })).toContainText('1');
	await context.setOffline(false);
	await laptop.goto('/#/contacts');
	await laptop.getByLabel('Name, E-Mail, Telefon, Ort …').fill('Offline');
	await expect(laptop.getByRole('link', { name: 'Otto Offline' })).toBeVisible({ timeout: 30_000 });
});
