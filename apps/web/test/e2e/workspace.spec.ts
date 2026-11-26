import { expect, test } from '@playwright/test';
import { failOnCspViolations } from './csp-guard.ts';
import { signIn, switchAccount, waitForToastGone, dragOnto } from './helpers.ts';

failOnCspViolations();

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

test('names new folders right in the tree and moves a folder by drag & drop', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/documents');
	const tree = page.getByRole('navigation', { name: 'Ordner' });
	// «Neuer Ordner» opens a name field in the tree, not a dialog; Enter creates the folder.
	for (const name of ['Projekt Alpha', 'Ablage Beta']) {
		await page.getByRole('button', { name: 'Neuer Ordner' }).first().click();
		const field = tree.getByRole('textbox', { name: 'Name des neuen Ordners in «Alle Dateien»' });
		await expect(field).toBeFocused();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await field.fill(name);
		await field.press('Enter');
		await expect(tree.getByRole('button', { name: name, exact: true })).toBeVisible();
		await expect(field).toHaveCount(0);
	}
	// A subfolder: the field appears under its parent, which opens; Escape cancels.
	await tree.getByRole('button', { name: 'Unterordner in «Projekt Alpha» anlegen' }).click();
	await tree.getByRole('textbox').press('Escape');
	await expect(tree.getByRole('textbox')).toHaveCount(0);
	await tree.getByRole('button', { name: 'Unterordner in «Projekt Alpha» anlegen' }).click();
	await tree.getByRole('textbox', { name: 'Name des neuen Ordners in «Projekt Alpha»' }).fill('Offerten Gamma');
	await tree.getByRole('button', { name: 'Speichern' }).click();
	await expect(tree.getByRole('button', { name: 'Ordner «Projekt Alpha» zuklappen' })).toBeVisible();
	await expect(tree.getByRole('button', { name: 'Offerten Gamma', exact: true })).toBeVisible();
	// Renaming works the same way, from the folder's menu.
	await tree.getByRole('button', { name: 'Aktionen für «Ablage Beta»' }).click();
	await page.getByRole('menuitem', { name: 'Umbenennen' }).click();
	const rename = tree.getByRole('textbox', { name: 'Neuer Name für «Ablage Beta»' });
	await expect(rename).toHaveValue('Ablage Beta');
	await rename.fill('Ablage Delta');
	await rename.press('Enter');
	await expect(tree.getByRole('button', { name: 'Ablage Delta', exact: true })).toBeVisible();
	await tree
		.getByRole('listitem')
		.filter({ has: page.getByRole('button', { name: 'Ablage Delta', exact: true }) })
		.locator('[draggable="true"]')
		.dragTo(tree.getByRole('button', { name: 'Offerten Gamma', exact: true }));
	await expect(page.getByText('Ordner «Ablage Delta» verschoben')).toBeVisible();
	await tree.getByRole('button', { name: 'Ablage Delta', exact: true }).click();
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

	// The address edits as street, number, postal code and city; Tab moves between them without saving.
	await page.getByText('Adresse', { exact: true }).locator('..').getByRole('button').click();
	const address = page.getByRole('group', { name: 'Adresse' });
	await address.getByLabel('Strasse').fill('Bahnhofstrasse');
	await page.keyboard.press('Tab');
	await expect(address.getByLabel('Nr.')).toBeFocused();
	await address.getByLabel('Nr.').fill('57');
	await address.getByLabel('PLZ').fill('3255');
	await address.getByLabel('Ort').fill('Rapperswil BE');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Bahnhofstrasse 57, 3255 Rapperswil BE' })).toBeVisible();
	await expect(page.getByText('Adresse gespeichert')).toBeVisible();
	await expect(
		page.getByRole('link', { name: '«Bahnhofstrasse 57, 3255 Rapperswil BE» in Google Maps öffnen (neuer Tab)' }),
	).toHaveAttribute(
		'href',
		'https://www.google.com/maps/search/?api=1&query=Bahnhofstrasse%2057%2C%203255%20Rapperswil%20BE',
	);

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

test('shows an info card when hovering an appointment and hides it on Escape', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/calendar?view=week');
	const appointment = page.getByRole('grid').first().getByRole('button').first();
	await appointment.hover();
	const card = page.getByRole('tooltip');
	await expect(card).toBeVisible();
	await expect(card.getByRole('term')).toContainText(['Art', 'Zuständig']);
	await expect(card).toContainText('Klicken öffnet den Termin.');
	await expect(card.getByRole('link', { name: /in Google Maps öffnen/ })).toHaveAttribute('target', '_blank');
	// Described by the card while it is open, but the button keeps its own role: a click opens the appointment.
	await expect(appointment).toHaveAttribute('aria-describedby', /^peek-/);
	expect(await appointment.getAttribute('aria-expanded')).toBeNull();
	await page.keyboard.press('Escape');
	await expect(card).toBeHidden();
});

test('opens appointments in a panel beside the calendar, which stays usable', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/calendar?view=week');
	const first = page.getByRole('grid').first().getByRole('button').first();
	await first.click();
	const panel = page.getByRole('dialog', { name: 'Termin bearbeiten' });
	await expect(panel.getByLabel('Titel')).toBeFocused();
	const title = await panel.getByLabel('Titel').inputValue();
	// Non-modal: another appointment opens in the same panel with one click.
	const second = page.getByRole('grid').nth(1).getByRole('button').first();
	await second.click();
	await expect(panel.getByLabel('Titel')).not.toHaveValue(title);
	// Unsaved edits are not dropped silently when switching.
	await panel.getByLabel('Titel').fill('Geändert');
	await first.click();
	await page.getByRole('button', { name: 'Verwerfen' }).click();
	await expect(panel.getByLabel('Titel')).toHaveValue(title);
	await panel.getByRole('button', { name: 'Schliessen' }).click();
	await expect(panel).toBeHidden();
});

test('opens a task on its own page and edits it there', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/planner?view=list');
	const row = page.getByRole('table').getByRole('button').first();
	const title = (await row.textContent())!.trim();
	await row.click();
	await expect(page).toHaveURL(/#\/planner\/[0-9a-f-]+$/);
	const taskUrl = page.url();
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	const save = page.getByRole('button', { name: 'Speichern' });
	await expect(save).toBeDisabled();
	await page.getByLabel('Beschreibung').fill('Mehr Platz für die Details.');
	await save.click();
	await expect(page.getByText('Aufgabe gespeichert', { exact: true })).toBeVisible();
	await expect(save).toBeDisabled();
	await page.getByRole('link', { name: 'Aufgaben' }).first().click();
	await expect(page).toHaveURL(/#\/planner(\?|$)/);
	// Older links with ?task= lead to the page as well.
	await page.goto(`/#/planner?task=${taskUrl.split('/').pop()}`);
	await expect(page).toHaveURL(taskUrl);
	await expect(page.getByLabel('Beschreibung')).toHaveValue('Mehr Platz für die Details.');
});

test('hides staff in the Spitex plan and opens a staff member’s page', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	await expect(page.getByRole('grid', { name: /Daniel Moser/ })).toBeVisible();
	await page.getByRole('button', { name: /^Mitarbeitende/ }).click();
	await page.getByRole('menuitemcheckbox', { name: 'Daniel Moser' }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('grid', { name: /Daniel Moser/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Mitarbeitende/ })).toContainText('4 von 5');
	// The name in a column header leads to the person's page, and back.
	await page.getByRole('grid').first().locator('..').getByRole('link', { name: 'Fatma Yilmaz' }).first().click();
	await expect(page.getByRole('heading', { level: 1, name: 'Fatma Yilmaz' })).toBeVisible();
	await expect(page.getByText('Auslastung')).toBeVisible();
	await page.getByRole('link', { name: 'Zurück' }).click();
	await expect(page).toHaveURL(/#\/spitex$/);
});

test('switches the Spitex client list between table and cards', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex/clients');
	await expect(page.getByRole('table')).toBeVisible();
	await page.getByRole('button', { name: 'Karten' }).click();
	await expect(page).toHaveURL(/view=cards/);
	await expect(page.getByRole('table')).toHaveCount(0);
	const card = page.getByRole('main').getByRole('listitem').first().getByRole('link');
	await expect(card).toContainText('Letzte 7 Tage');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Karten' })).toHaveAttribute('aria-pressed', 'true');
	await card.click();
	await expect(page).toHaveURL(/#\/spitex\/clients\/[0-9a-f-]+/);
});

test('suggests existing tags and keeps a contact’s tags a set', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/contacts');
	await page
		.getByRole('link')
		.filter({ hasText: /Baumann/ })
		.first()
		.click();
	const section = page.locator('section').filter({ has: page.getByRole('button', { name: /^Schlagwörter/ }) });
	await section.getByRole('button', { name: 'Tag', exact: true }).click();
	const field = section.getByRole('combobox', { name: 'Tag' });
	await expect(field).toBeFocused();
	// Known tags pop up right away under the field; arrow keys and Enter pick one.
	const options = page.getByRole('listbox', { name: 'Vorhandene Schlagwörter' }).getByRole('option');
	await expect(options.first()).toHaveText('Kostenträger');
	await field.press('ArrowDown');
	await expect(options.first()).toHaveAttribute('aria-selected', 'true');
	await field.press('Enter');
	await expect(section.getByText('Kostenträger', { exact: true })).toBeVisible();
	// Typing a known tag in other case adds nothing twice; a new one is created.
	await field.fill('newsletter');
	await field.press('Enter');
	await expect(section.getByText('Newsletter', { exact: true })).toHaveCount(1);
	await field.fill('VIP');
	await expect(options.last()).toHaveText('«VIP» neu anlegen');
	await field.press('Enter');
	await field.press('Escape');
	await expect(section.getByRole('button', { name: /^Schlagwörter/ })).toContainText('4');
});

test('adds a client from the open visits and plans their first visit', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	const add = page.getByRole('button', { name: 'Neue:r Klient:in' }).last();
	await expect(add).toHaveCSS('opacity', '0');
	await page.getByText('Offene Einsätze', { exact: true }).first().hover();
	await expect(add).toHaveCSS('opacity', '1');
	await add.click();
	await page.getByLabel('Vorname').fill('Rosa');
	await page.getByLabel('Nachname').fill('Planbar');
	await page.getByRole('button', { name: 'Speichern' }).click();
	const visit = page.getByRole('dialog', { name: 'Neuer Termin' });
	await expect(visit.getByLabel('Titel')).toHaveValue('Rosa Planbar');
});

test('hides weekdays in week and month view and brings them back', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/calendar?view=week');
	const heads = page.locator('[data-grid-head]');
	await expect(heads).toHaveCount(7);
	await page.getByRole('button', { name: '«Sa» ausblenden' }).click();
	await page.getByRole('button', { name: '«So» ausblenden' }).click();
	await expect(heads).toHaveCount(5);
	const restore = page.getByRole('button', { name: 'Sa, So ausgeblendet' });
	await expect(restore).toBeVisible();

	// The month view leaves out the same days.
	await page.goto('/#/calendar?view=month');
	await expect(page.getByRole('button', { name: '«Sa» ausblenden' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: '«Mo» ausblenden' })).toBeAttached();
	await restore.click();
	await expect(page.getByRole('button', { name: '«So» ausblenden' })).toBeAttached();
	await expect(restore).toBeHidden();
});

test('jumps to a day, week or month from the small calendar', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/calendar?view=week');
	await page.getByRole('button', { name: 'Datum wählen' }).click();
	const picker = page.getByRole('dialog');
	// A year leads on to its months; a month opens the month view.
	await picker.getByRole('button', { name: 'Jahr', exact: true }).click();
	await picker.getByRole('button', { name: '2027', exact: true }).click();
	await picker.getByRole('button', { name: 'Februar 2027' }).click();
	await expect(picker).toBeHidden();
	await expect(page.getByRole('heading', { level: 2, name: 'Februar 2027' })).toBeVisible();
	await expect(page).toHaveURL(/view=month/);

	// A week opens the week view; arrow keys move between the weeks.
	await page.getByRole('button', { name: 'Datum wählen' }).click();
	await picker.getByRole('button', { name: 'Woche', exact: true }).click();
	await picker.getByRole('button', { name: /^KW 6,/ }).focus();
	await page.keyboard.press('ArrowDown');
	await expect(picker.getByRole('button', { name: /^KW 7,/ })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { level: 2, name: '15. Feb. – 21. Feb. 2027' })).toBeVisible();

	// The Spitex day planning jumps to the picked day.
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	// The week's load per person sits beside the plan; each column shows the day's load.
	await expect(page.getByRole('table', { name: 'Einsatzzeit pro Person und Tag (Stunden:Minuten)' })).toBeVisible();
	await expect(page.getByText(/h geplant$/).first()).toBeVisible();
	await page.getByRole('button', { name: 'Datum wählen' }).click();
	await picker.getByRole('button', { name: 'Montag, 30. November 2026' }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Montag, 30. November 2026' })).toBeVisible();
});

test('releases a week of the Spitex plan to the staff and withdraws it again', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	// The current week of the demo is released; next week is still a draft.
	const status = page.getByRole('status').filter({ hasText: /KW \d+ ·/ });
	await expect(status).toContainText('Freigegeben');
	await page.getByRole('button', { name: 'Datum wählen' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Woche', exact: true }).click();
	await page.getByRole('dialog').locator('[aria-pressed="true"][data-cell]').focus();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(status).toContainText('Entwurf');
	await expect(status).toContainText('Mitarbeitende sehen diese Woche noch nicht.');
	// On the page only the icon; week, state and hint appear on hover.
	await expect(page.getByText(/^KW \d+ · Entwurf$/)).toBeHidden();
	await page.getByRole('button', { name: /^KW \d+ · Entwurf$/ }).hover();
	await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(
		'Mitarbeitende sehen diese Woche noch nicht.',
	);
	await page.mouse.move(0, 0);

	await page.getByRole('button', { name: 'Woche freigeben' }).click();
	const dialog = page.getByRole('dialog', { name: /KW \d+/ });
	await expect(dialog).toContainText(/\d+ Einsätze für \d+ Mitarbeitende werden sichtbar/);
	await dialog.getByRole('button', { name: 'Woche freigeben' }).click();
	await expect(page.getByText(/^KW \d+ freigegeben$/)).toBeVisible();
	await expect(status).toContainText('Freigegeben');
	await expect(status).toContainText('von Besi Morina');

	await page.getByRole('button', { name: 'Freigabe entziehen' }).click();
	await dialog.getByRole('button', { name: 'Freigabe entziehen' }).click();
	await expect(status).toContainText('Entwurf');
	await expect(page.getByRole('button', { name: 'Woche freigeben' })).toBeVisible();
});

test('shows staff only their own visits, and a week only once it is released', async ({ page }) => {
	await signIn(page, 'daniel.moser@spitex-seeland.ch');
	// No plan, no clients, no calendar: only the own visits.
	const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
	await expect(navigation.getByRole('link', { name: 'Meine Einsätze' })).toBeVisible();
	await expect(navigation.getByRole('link', { name: 'Spitex' })).toHaveCount(0);
	await expect(navigation.getByRole('link', { name: 'Kontakte' })).toHaveCount(0);
	await page.goto('/#/spitex');
	await expect(page.getByText('Kein Zugriff')).toBeVisible();

	await page.goto('/#/visits');
	await expect(page.getByRole('heading', { level: 1, name: 'Meine Einsätze' })).toBeVisible();
	const visits = page.getByRole('listitem').filter({ hasText: /\d+ min/ });
	await expect(visits.first()).toBeVisible();
	await expect(visits.first().getByRole('link', { name: /in Google Maps öffnen/ })).toBeVisible();
	await expect(visits.first().getByRole('link', { name: /^\+41/ })).toHaveAttribute('href', /^tel:/);
	// Next week is a draft: nothing of it shows.
	await page.getByRole('button', { name: 'Weiter' }).click();
	await expect(page.getByText(/Der Plan für KW \d+ ist noch in Arbeit/)).toBeVisible();
	await expect(visits).toHaveCount(0);

	// The planner releases next week …
	await switchAccount(page, 'besi@stille.ch');
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	for (let day = 0; day < 7; day++) await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByRole('button', { name: 'Woche freigeben' }).click();
	await page
		.getByRole('dialog', { name: /KW \d+/ })
		.getByRole('button', { name: 'Woche freigeben' })
		.click();
	await expect(page.getByText(/^KW \d+ freigegeben$/)).toBeVisible();

	// … and Daniel hears about it: the notification leads to the week, which is there, read-only.
	await switchAccount(page, 'daniel.moser@spitex-seeland.ch');
	await page.getByRole('button', { name: /Benachrichtigungen/ }).click();
	await page.getByRole('button', { name: /Dein Einsatzplan für KW \d+ ist da\./ }).click();
	await expect(page).toHaveURL(/#\/visits\?week=\d{4}-\d{2}-\d{2}/);
	await expect(visits.first()).toBeVisible();
	await expect(page.getByRole('button', { name: /freigeben|Zuweisen|Neuer Einsatz/ })).toHaveCount(0);

	// On a phone the bar at the bottom offers only what the role may open.
	await page.setViewportSize({ width: 390, height: 800 });
	const bar = page.getByRole('navigation', { name: 'Schnellnavigation' });
	await expect(bar.getByRole('link')).toHaveText(['Start', 'Meine Einsätze']);
});

test('signs a team member out and deactivates them, handing their visits back to the plan', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/settings/team');
	const row = (name: string) => page.getByRole('row').filter({ hasText: name });
	await expect(row('Ruth Gerber')).toContainText('Seit über 30 Tagen nicht angemeldet');
	await expect(row('Fatma Yilmaz')).toContainText('Geräte: 1');

	await row('Fatma Yilmaz').getByRole('button', { name: 'Weitere Aktionen' }).click();
	await page.getByRole('menuitem', { name: 'Von allen Geräten abmelden' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Von allen Geräten abmelden' }).click();
	await expect(row('Fatma Yilmaz')).toContainText('Geräte: 0');

	await row('Daniel Moser').getByRole('button', { name: 'Weitere Aktionen' }).click();
	await page.getByRole('menuitem', { name: 'Deaktivieren' }).click();
	const dialog = page.getByRole('dialog', { name: 'Daniel Moser deaktivieren?' });
	await expect(dialog).toContainText(/Künftige Einsätze: \d+/);
	await expect(dialog.getByRole('checkbox', { name: /Offene Einsätze/ })).toBeChecked();
	await dialog.getByRole('button', { name: 'Deaktivieren' }).click();
	await expect(row('Daniel Moser')).toContainText('Inaktiv');
	const history = page.getByRole('region', { name: 'Letzte Änderungen' });
	await expect(history).toContainText('hat Daniel Moser deaktiviert');
	await expect(history).toContainText('hat Fatma Yilmaz von allen Geräten abgemeldet');
});

test('groups the rights of each role by booked product and resets a template role', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/settings/roles');
	// Stille Physio has no Spitex: no Spitex section, and the reception's Spitex right rests.
	const matrix = page.getByRole('table', { name: 'Rechte pro Rolle, nach Produkt gruppiert' });
	await expect(matrix.getByRole('rowheader', { name: 'Physio', exact: true })).toBeVisible();
	await expect(matrix.getByRole('rowheader', { name: 'Spitex', exact: true })).toHaveCount(0);
	await expect(matrix.getByRole('columnheader', { name: /Empfang/ }).first()).toContainText(
		'Ruht, nicht gebucht: Spitex',
	);

	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/settings/roles');
	await expect(matrix.getByRole('rowheader', { name: 'Spitex', exact: true })).toBeVisible();
	await expect(matrix.getByRole('rowheader', { name: 'Physio', exact: true })).toHaveCount(0);
	const care = matrix.getByRole('columnheader', { name: /Spitex-Pflege/ });
	await expect(care).toContainText('Vorlage Spitex');

	await care.getByRole('button', { name: 'Spitex-Pflege' }).click();
	const dialog = page.getByRole('dialog', { name: 'Rolle bearbeiten' });
	await dialog.getByRole('group', { name: 'Grundfunktionen' }).getByRole('checkbox').first().click();
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await care.getByRole('button', { name: 'Spitex-Pflege' }).click();
	await dialog.getByRole('button', { name: 'Auf Vorlage zurücksetzen' }).click();
	await expect(page.getByText('Rolle auf Vorlage zurückgesetzt')).toBeVisible();
	await care.getByRole('button', { name: 'Spitex-Pflege' }).click();
	await expect(dialog.getByRole('group', { name: 'Grundfunktionen' }).getByRole('checkbox').first()).not.toBeChecked();
	await expect(dialog.getByRole('group', { name: 'Spitex' }).getByRole('checkbox').nth(2)).toBeChecked();
});
