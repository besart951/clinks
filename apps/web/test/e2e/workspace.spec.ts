import { expect, test, type Locator, type Page } from '@playwright/test';
import { failOnCspViolations } from './csp-guard.ts';

failOnCspViolations();

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

test('drags a task to another column and undoes the move', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/planner');
	const todo = page.getByRole('region', { name: 'Zu erledigen' });
	const doing = page.getByRole('region', { name: 'In Arbeit' });
	const card = todo.getByRole('listitem').first();
	const title = (await card.locator('.line-clamp-2').innerText()).trim();
	const from = (await card.boundingBox())!;
	const to = (await doing.getByRole('list').boundingBox())!;
	await page.mouse.move(from.x + 20, from.y + 20);
	await page.mouse.down();
	await page.mouse.move(from.x + 40, from.y + 30, { steps: 4 });
	await expect(card).toHaveAttribute('data-lifted', '');
	await page.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 12 });
	await page.mouse.up();
	await expect(doing.getByRole('button', { name: title })).toBeVisible();
	await expect(todo.getByRole('button', { name: title })).toHaveCount(0);
	await expect(page.getByText('Verschoben nach «In Arbeit»')).toBeVisible();
	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(todo.getByRole('button', { name: title })).toBeVisible();
});

test('moves a task with Alt + arrow keys', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/planner');
	const todo = page.getByRole('region', { name: 'Zu erledigen' });
	const button = todo.getByRole('listitem').first().getByRole('button');
	const title = (await button.locator('.line-clamp-2').innerText()).trim();
	await button.focus();
	await page.keyboard.press('Alt+ArrowRight');
	const moved = page.getByRole('region', { name: 'In Arbeit' }).getByRole('button', { name: title });
	await expect(moved).toBeFocused();
	await expect(page.getByRole('status').filter({ hasText: `«${title}» in In Arbeit` })).toBeAttached();
});

test('builds a folder tree and moves a folder by drag & drop', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/documents');
	const tree = page.getByRole('navigation', { name: 'Ordner' });
	for (const name of ['Projekt Alpha', 'Ablage Beta']) {
		await page.getByRole('button', { name: 'Neuer Ordner' }).first().click();
		await page.getByRole('dialog').getByRole('textbox').fill(name);
		await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
		await expect(tree.getByRole('button', { name: name, exact: true })).toBeVisible();
	}
	await tree.getByRole('button', { name: 'Unterordner in «Projekt Alpha» anlegen' }).click();
	await page.getByRole('dialog').getByRole('textbox').fill('Offerten Gamma');
	await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
	await expect(tree.getByRole('button', { name: 'Ordner «Projekt Alpha» zuklappen' })).toBeVisible();
	await expect(tree.getByRole('button', { name: 'Offerten Gamma', exact: true })).toBeVisible();
	await tree
		.getByRole('listitem')
		.filter({ has: page.getByRole('button', { name: 'Ablage Beta', exact: true }) })
		.locator('[draggable="true"]')
		.dragTo(tree.getByRole('button', { name: 'Offerten Gamma', exact: true }));
	await expect(page.getByText('Ordner «Ablage Beta» verschoben')).toBeVisible();
	await tree.getByRole('button', { name: 'Ablage Beta', exact: true }).click();
	await expect(page.getByRole('navigation', { name: 'Ordnerpfad' })).toContainText('Projekt Alpha');
	await expect(page.getByRole('navigation', { name: 'Ordnerpfad' })).toContainText('Offerten Gamma');
});

test('changes an appointment time by dragging its edge or with Alt + arrows', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/calendar');
	const appointment = page.locator('[data-grid-column] button').first();
	const before = (await appointment.getAttribute('aria-label'))!;
	const title = before.replace(/^\S+\s/, '');
	const box = (await appointment.boundingBox())!;
	await appointment.hover();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height + 80, { steps: 6 });
	await page.mouse.up();
	await expect(page.getByText(`Zeit von «${title}» geändert`)).toBeVisible();
	const resized = page.getByRole('button', { name: title }).first();
	await expect(resized).not.toHaveAttribute('aria-label', before);
	const afterDrag = (await resized.getAttribute('aria-label'))!;
	await resized.focus();
	await page.keyboard.press('Alt+ArrowUp');
	await expect(page.getByRole('button', { name: title }).first()).not.toHaveAttribute('aria-label', afterDrag);
});

test('adds an appointment from the start page without leaving it', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Neuer Termin' }).click();
	const sheet = page.getByRole('dialog');
	await sheet.getByLabel('Titel').fill('Rückruf Versicherung');
	await sheet.getByRole('button', { name: 'Speichern' }).click();
	await expect(sheet).toBeHidden();
	await expect(page).toHaveURL(/#\/dashboard/);
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

/** A toast sits over the action row at the bottom right and pauses while hovered: move away until it is gone. */
async function waitForToastGone(page: Page, text: string) {
	await expect(page.getByText(text)).toBeVisible();
	await page.mouse.move(0, 0);
	await expect(page.getByText(text)).toBeHidden({ timeout: 10_000 });
}

test('connects an own Infomaniak bucket per tenant', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/settings/storage');
	await expect(page.getByRole('heading', { level: 1, name: 'Dokumentenspeicher' })).toBeVisible();
	await expect(page.getByRole('radio', { name: 'CLinks-Speicher' })).toBeChecked();
	await page.getByRole('radio', { name: 'Infomaniak Object Storage' }).check();
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('textbox', { name: 'Bucket' })).toBeFocused();
	await waitForToastGone(page, 'Bitte überprüfe die eingegebenen Daten.');
	await page.getByRole('textbox', { name: 'Bucket' }).fill('stille-physio-docs');
	await page.getByLabel('Access Key ID').fill('EC2ACCESS');
	await page.getByLabel('Secret Access Key').fill('top-secret-9876');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Speicher-Einstellungen gespeichert.')).toBeVisible();
	await expect(page.getByText('Gespeichert (endet auf 9876)')).toBeVisible();
	await expect(page.getByLabel('Secret Access Key')).toHaveValue('');
	await waitForToastGone(page, 'Speicher-Einstellungen gespeichert.');
	await page.getByRole('button', { name: 'Verbindung testen' }).click();
	await expect(page.getByText('Verbindung zum Bucket funktioniert.')).toBeVisible();
});

/** Native drag and drop in small steps, like a real mouse; a direct jump does not always start the drag. */
async function dragOnto(page: Page, source: Locator, target: Locator) {
	const from = (await source.boundingBox())!;
	const to = (await target.boundingBox())!;
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
	await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
	await page.mouse.up();
}

test('moves Spitex visits by drag and drop, from the list and with time running left to right', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	const list = page.getByRole('list').filter({ has: page.getByTitle(/zuzuweisen/) });
	const open = page.getByRole('grid', { name: /Offene Einsätze/ });
	const fatma = page.getByRole('grid', { name: /Fatma Yilmaz/ });

	await page.getByRole('button', { name: 'Zeit von links nach rechts' }).click();
	await expect(page).toHaveURL(/axis=horizontal/);
	await expect(page.getByRole('button', { name: 'Zeit von links nach rechts' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	// Along a row: back to the open visits removes the assignment.
	const visit = fatma.getByRole('button').first();
	const title = (await visit.locator('span').first().textContent())!.trim();
	const inList = list.getByText(title, { exact: true });
	const listed = await inList.count();
	await dragOnto(page, visit, open);
	await expect(inList).toHaveCount(listed + 1);

	// From the list, by its handle, onto a person.
	await page.getByRole('button', { name: 'Zeit von oben nach unten' }).click();
	await expect(page).not.toHaveURL(/axis=/);
	const daniel = page.getByRole('grid', { name: /Daniel Moser/ });
	const planned = daniel.getByRole('button', { name: new RegExp(title) });
	const before = await planned.count();
	await dragOnto(page, page.getByTitle(`Ziehen, um «${title}» zuzuweisen`).first(), daniel);
	await expect(planned).toHaveCount(before + 1);
	await expect(inList).toHaveCount(listed);
});
