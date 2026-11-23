import { newId } from '@clinks/domain/ids';
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

	// A previously loaded PWA can restart offline with its pending SQLite transaction.
	await openNewContact(page);
	await context.setOffline(true);
	await saveContact(page, 'Otto', 'Offline');
	await expect(page.getByRole('status', { name: /Sync/ })).toContainText('1');
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
	await page.reload();
	await expect(page.getByRole('heading', { level: 1, name: 'Otto Offline' })).toBeVisible();
	await context.setOffline(false);
	await laptop.goto('/#/contacts');
	await laptop.getByLabel('Name, E-Mail, Telefon, Ort …').fill('Offline');
	await expect(laptop.getByRole('link', { name: 'Otto Offline' })).toBeVisible({ timeout: 30_000 });
});

test('syncs a document uploaded offline to another device', async ({ page, browser, context }) => {
	const email = `documents-${Date.now()}@example.ch`;
	await signUpAndOnboard(page, email, 'Dokumente Praxis');
	const laptop = await secondDevice(browser, email);
	await laptop.goto('/#/documents');
	await page.goto('/#/documents');
	const file = page.locator('input[type=file]');
	await expect(file).toBeAttached();
	await context.setOffline(true);
	await file.setInputFiles({
		name: 'Besuchsbericht.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('Termin bestätigt'),
	});
	await expect(page.getByText('Besuchsbericht.txt', { exact: true })).toBeVisible();
	await expect(laptop.getByText('Besuchsbericht.txt', { exact: true })).toHaveCount(0);
	await context.setOffline(false);
	await expect(laptop.getByText('Besuchsbericht.txt', { exact: true })).toBeVisible({ timeout: 30_000 });
	await laptop.getByText('Besuchsbericht.txt', { exact: true }).click();
	await expect(laptop.getByText('Termin bestätigt', { exact: true })).toBeVisible();
	if (process.env.TEST_VERSIONED_FILES) {
		await laptop.keyboard.press('Escape');
		const row = laptop.getByRole('row').filter({ hasText: 'Besuchsbericht.txt' });
		await row.getByRole('button').last().click();
		await laptop.getByRole('menuitem', { name: 'Versionen' }).click();
		await laptop
			.getByLabel('Neue Version hochladen')
			.setInputFiles({ name: 'revision.txt', mimeType: 'text/plain', buffer: Buffer.from('Zweite Version') });
		const dialog = laptop.getByRole('dialog');
		await expect(dialog.getByRole('listitem')).toHaveCount(2);
		await dialog.getByRole('button', { name: 'Wiederherstellen' }).click();
		await expect(dialog.getByRole('listitem')).toHaveCount(3);
		await laptop.keyboard.press('Escape');
		await laptop.getByText('Besuchsbericht.txt', { exact: true }).click();
		await expect(laptop.getByText('Termin bestätigt', { exact: true })).toBeVisible();
	}
});

test('moves an existing local task to sync on the next sign-in', async ({ page, browser }) => {
	const email = `upgrade-${Date.now()}@example.ch`;
	await signUpAndOnboard(page, email, 'Migration Praxis');
	const title = 'Aufgabe aus Phase 3';
	await page.evaluate(
		({ id, title }) => {
			const key = 'clinks.workspace.database.v1';
			const data = JSON.parse(localStorage.getItem(key) ?? '{"tasks":[]}');
			const { tenantId } = JSON.parse(localStorage.getItem('clinks.workspace.session')!);
			const now = new Date().toISOString();
			data.tasks.push({
				id,
				tenantId,
				title,
				description: '',
				revision: 1,
				createdAt: now,
				updatedAt: now,
				status: 'todo',
				priority: 'medium',
				assigneeIds: [],
				labels: [],
				order: 0,
				dueDate: null,
				checklist: [],
				contactId: null,
			});
			localStorage.setItem(key, JSON.stringify(data));
		},
		{ id: newId(), title },
	);
	await page.reload();
	await expect
		.poll(() =>
			page.evaluate(
				(title) =>
					JSON.parse(localStorage.getItem('clinks.workspace.database.v1')!).tasks.some(
						(row: { title: string }) => row.title === title,
					),
				title,
			),
		)
		.toBe(false);
	const laptop = await secondDevice(browser, email);
	await laptop.goto('/#/planner');
	await expect(laptop.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('shows board presence and stores shared planning notes', async ({ page, browser }) => {
	test.skip(!process.env.VITE_COLLAB_URL, 'Requires the collaboration server');
	const email = `collab-${Date.now()}@example.ch`;
	await signUpAndOnboard(page, email, 'Collab Praxis');
	const other = await secondDevice(browser, email);
	for (const device of [page, other]) {
		await device.goto('/#/planner');
		await device.locator('summary').filter({ hasText: 'Gemeinsame Planungsnotizen' }).click();
	}
	await expect(other.getByText('Anwesend: 2')).toBeVisible();
	await page.locator('[contenteditable=true]').fill('Gemeinsamer Wochenplan');
	await expect(other.locator('[contenteditable=true]')).toHaveText('Gemeinsamer Wochenplan');
	await page.goto('/#/dashboard');
	await other.goto('/#/dashboard');
	await other.goto('/#/planner');
	await other.locator('summary').filter({ hasText: 'Gemeinsame Planungsnotizen' }).click();
	await expect(other.locator('[contenteditable=true]')).toHaveText('Gemeinsamer Wochenplan');
});
