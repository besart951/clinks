import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email = 'besi@stille.ch') {
	await page.goto('/');
	await page.evaluate(() => {
		localStorage.clear();
		localStorage.setItem(
			'clinks.workspace.network',
			JSON.stringify({ minLatency: 0, maxLatency: 0, failureRate: 0, simulateOffline: false }),
		);
	});
	await page.goto('/#/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill('demo1234');
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page).toHaveURL(/#\/dashboard/);
}

test('signs in with a demo account and lands on the dashboard', async ({ page }) => {
	await signIn(page);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Besi');
	await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
});

test('creates a contact and opens its page', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/contacts?new=1');
	await page.getByLabel('Vorname').fill('Lea');
	await page.getByLabel('Nachname').fill('Prototyp');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Lea Prototyp' })).toBeVisible();
	await page.goto('/#/contacts');
	await page.getByLabel('Name, E-Mail, Telefon, Ort …').fill('Prototyp');
	await expect(page.getByRole('link', { name: 'Lea Prototyp' })).toBeVisible();
});

test('shows field errors from the shared validation', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/contacts?new=1');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Dieses Feld ist erforderlich.')).toBeVisible();
});

test('adds a task to the board', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/planner');
	await page.getByRole('button', { name: 'Aufgabe in «Zu erledigen» hinzufügen' }).click();
	await page.getByLabel('Titel eingeben und Enter drücken').fill('Prototyp testen');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('region', { name: 'Zu erledigen' }).getByText('Prototyp testen')).toBeVisible();
});

test('issues an invoice with a QR payment part', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/finance/invoices/new');
	await page.getByRole('combobox').first().click();
	await page.getByRole('option').nth(1).click();
	await page.getByLabel('Beschreibung').first().fill('Beratung');
	await page.getByLabel('Preis CHF').first().fill('150');
	await page.getByLabel('Preis CHF').first().blur();
	await page.getByRole('button', { name: 'Rechnung stellen' }).click();
	await expect(page.getByRole('region', { name: 'QR-Rechnung' })).toBeVisible();
	await expect(page.getByText('Beratung')).toBeVisible();
});

test('hides areas the role does not allow', async ({ page }) => {
	await signIn(page, 'jonas.keller@stille.ch');
	await expect(
		page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Aufgaben' }),
	).toHaveCount(0);
	await page.goto('/#/planner');
	await expect(page.getByText('Kein Zugriff')).toBeVisible();
});

test('shows the offline banner when the connection is simulated away', async ({ page }) => {
	await signIn(page);
	await page.evaluate(() =>
		localStorage.setItem(
			'clinks.workspace.network',
			JSON.stringify({ minLatency: 0, maxLatency: 0, failureRate: 0, simulateOffline: true }),
		),
	);
	await page.reload();
	await expect(page.getByRole('alert').filter({ hasText: 'Keine Verbindung' })).toBeVisible();
});

test('switches the interface to English', async ({ page }) => {
	await page.goto('/#/login');
	await page.getByRole('button', { name: 'Sprachen' }).click();
	await page.getByRole('menuitemradio', { name: 'English' }).click();
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('edits master data in place and collapses sections', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/contacts?new=1');
	await page.getByLabel('Vorname').fill('Inline');
	await page.getByLabel('Nachname').fill('Test');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Inline Test' })).toBeVisible();

	// Click the value, type, Enter saves; the toast offers undo.
	await page.getByRole('button', { name: 'Test', exact: true }).click();
	await page.getByRole('textbox', { name: 'Nachname' }).fill('Direkt');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { level: 1, name: 'Inline Direkt' })).toBeVisible();
	await expect(page.getByText('Nachname gespeichert')).toBeVisible();

	// Escape restores the value without saving.
	await page.getByRole('button', { name: 'Direkt', exact: true }).click();
	await page.getByRole('textbox', { name: 'Nachname' }).fill('Verworfen');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('heading', { level: 1, name: 'Inline Direkt' })).toBeVisible();

	// Accordion sections fold away and remember it.
	const master = page.getByRole('button', { name: 'Stammdaten' });
	await expect(master).toHaveAttribute('aria-expanded', 'true');
	await master.click();
	await expect(master).toHaveAttribute('aria-expanded', 'false');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Stammdaten' })).toHaveAttribute('aria-expanded', 'false');
});

test('connects an own Infomaniak bucket per tenant', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/settings/storage');
	await expect(page.getByRole('heading', { level: 1, name: 'Dokumentenspeicher' })).toBeVisible();
	await expect(page.getByRole('radio', { name: 'CLinks-Speicher' })).toBeChecked();
	await page.getByRole('radio', { name: 'Infomaniak Object Storage' }).check();
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('textbox', { name: 'Bucket' })).toBeFocused();
	await page.getByRole('textbox', { name: 'Bucket' }).fill('stille-physio-docs');
	await page.getByLabel('Access Key ID').fill('EC2ACCESS');
	await page.getByLabel('Secret Access Key').fill('top-secret-9876');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Speicher-Einstellungen gespeichert.')).toBeVisible();
	await expect(page.getByText('Gespeichert (endet auf 9876)')).toBeVisible();
	await expect(page.getByLabel('Secret Access Key')).toHaveValue('');
	await page.getByRole('button', { name: 'Verbindung testen' }).click();
	await expect(page.getByText('Verbindung zum Bucket funktioniert.')).toBeVisible();
});
