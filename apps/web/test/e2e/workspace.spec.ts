import { expect, test } from '@playwright/test';
import { failOnCspViolations } from './csp-guard.ts';
import { readFileSync } from 'node:fs';
import { qrReference } from '@clinks/domain/qr-bill';
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
	// The field takes the focus: typing right away works.
	await expect(page.getByLabel('Titel eingeben und Enter drücken')).toBeFocused();
	await page.keyboard.type('Prototyp testen');
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
	await page.getByLabel('Leistung von').fill('2026-11-02');
	await page.getByLabel('bis', { exact: true }).fill('2026-11-20');
	await page.getByRole('button', { name: 'Rechnung stellen' }).click();
	const bill = page.getByRole('region', { name: 'QR-Rechnung' });
	await expect(bill).toBeVisible();
	await expect(page.getByText('Beratung')).toBeVisible();
	await expect(page.getByText(/Leistungszeitraum 02\.11\.2026 – 20\.11\.2026/)).toBeVisible();
	// Stille Physio has a QR-IBAN: the bill carries a 27-digit QR reference, grouped in fives.
	await expect(bill.getByText('CH44 3199 9123 0008 8901 2')).toBeVisible();
	await expect(bill.getByText(/^\d{2}( \d{5}){5}$/)).toBeVisible();

	// Issued: the PDF/A is archived and downloads as a file; it lies locked in «Rechnungen».
	await expect(page.getByText('PDF/A archiviert')).toBeVisible();
	const number = (await page.getByRole('heading', { level: 1 }).innerText()).replace('Rechnung ', '');
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'PDF herunterladen' }).click();
	expect((await download).suggestedFilename()).toBe(`${number}.pdf`);
	await page.goto('/#/documents');
	await page
		.getByRole('button', { name: /^Rechnungen/ })
		.first()
		.click();
	const row = page.getByRole('listitem').filter({ hasText: `Rechnung ${number}.pdf` });
	await expect(row).toContainText('Archiviert');
	// Archived: neither the buttons on the row nor its right-click menu offer to delete or rename it.
	await row.hover();
	await expect(row.getByRole('button', { name: 'Löschen' })).toHaveCount(0);
	await row.click({ button: 'right' });
	await expect(page.getByRole('menuitem', { name: 'Herunterladen' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Löschen' })).toHaveCount(0);
	await expect(page.getByRole('menuitem', { name: 'Umbenennen' })).toHaveCount(0);
});

test('sends an issued invoice as a secure link that opens with the postcode', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/finance/invoices/new');
	await page.getByRole('combobox').first().click();
	await page.getByRole('option').nth(1).click();
	await page.getByLabel('Beschreibung').first().fill('Behandlung');
	await page.getByLabel('Preis CHF').first().fill('120');
	await page.getByLabel('Preis CHF').first().blur();
	await page.getByRole('button', { name: 'Rechnung stellen' }).click();
	await expect(page.getByText('PDF/A archiviert')).toBeVisible();
	const number = (await page.getByRole('heading', { level: 1 }).innerText()).replace('Rechnung ', '');
	await expect(page.getByText('Noch nicht per E-Mail gesendet.', { exact: false })).toBeVisible();

	// Physio handles health data: the secure link is chosen, the address comes from the contact.
	await page.getByRole('button', { name: 'Senden', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: `Rechnung ${number} senden` });
	await expect(dialog.getByRole('radio', { name: /Sicherer Link/ })).toBeChecked();
	const zip = /\((\d{4})\)/.exec(await dialog.getByText(/Postleitzahl der Rechnungsadresse/).innerText())![1];
	await dialog.getByLabel('An', { exact: true }).fill('patientin@example.ch');
	await dialog.getByRole('button', { name: 'Senden' }).click();
	await expect(page.getByText(`Rechnung ${number} an patientin@example.ch gesendet`)).toBeVisible();
	await expect(page.getByText(/an patientin@example\.ch$/)).toBeVisible();
	await expect(page.getByText(/Noch nicht geöffnet · gültig bis/)).toBeVisible();

	// The recipient's page: the wrong postcode is refused, the right one downloads the archived PDF.
	await page.getByRole('link', { name: 'Link öffnen (Demo)' }).click();
	await expect(page.getByRole('heading', { level: 1, name: `Rechnung ${number}` })).toBeVisible();
	await page.getByLabel('Postleitzahl').fill('0000');
	await page.getByRole('button', { name: 'PDF herunterladen' }).click();
	await expect(page.getByText('Die Postleitzahl stimmt nicht.')).toBeVisible();
	await page.getByLabel('Postleitzahl').fill(zip);
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'PDF herunterladen' }).click();
	expect((await download).suggestedFilename()).toBe(`Rechnung ${number}.pdf`);
	await page.goBack();
	await expect(page.getByText(/^Geöffnet am .* \(1×\)$/)).toBeVisible();

	// In the demo the mail lands in Mail › Gesendet, without amount or service.
	await page.goto('/#/mail');
	await page.getByRole('button', { name: /^Gesendet/ }).click();
	await page.getByText(`Rechnung ${number} von`).first().click();
	await expect(page.getByText(/Postleitzahl Ihrer Rechnungsadresse/).first()).toBeVisible();
});

test('sends a due reminder with its fee from the list of invoices to remind', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/settings');
	const reminders = page.getByRole('region', { name: 'Mahnwesen' });
	await reminders
		.getByRole('button', { name: /^Keine Gebühr/ })
		.first()
		.click();
	await reminders.getByRole('textbox', { name: '1. Mahnung: Gebühr in CHF' }).fill('20');
	await page.keyboard.press('Enter');
	await expect(page.getByText('1. Mahnung: Gebühr in CHF gespeichert')).toBeVisible();

	await page.goto('/#/finance');
	await expect(page.getByText(/zur Mahnung fällig\./)).toBeVisible();
	await page.getByRole('button', { name: 'Anzeigen' }).click();
	const first = page.getByRole('table').getByRole('link').first();
	const number = (await first.innerText()).trim();
	await first.click();
	const remind = page.getByRole('button', { name: /^\d\. Mahnung senden$/ });
	const level = (await remind.innerText()).trim()[0];
	await remind.click();
	const dialog = page.getByRole('dialog', { name: `${level}. Mahnung zu ${number}` });
	if (level === '1') await expect(dialog.getByText(/Mahngebühr CHF.20\.00/)).toBeVisible();
	await dialog.getByRole('radio', { name: /PDF im Anhang/ }).check();
	await dialog.getByLabel('An', { exact: true }).fill('kunde@example.ch');
	await dialog.getByRole('button', { name: 'Mahnung senden' }).click();
	await expect(page.getByText(`${level}. Mahnung zu ${number} an kunde@example.ch gesendet`)).toBeVisible();
	await expect(page.getByText(`${level}. Mahnung:`)).toBeVisible();
	// Sent: the next level waits for this reminder's own deadline.
	await expect(page.getByRole('button', { name: /^\d\. Mahnung senden$/ })).toHaveCount(0);
	await expect(page.getByText(new RegExp(`^${Number(level) + 1}\\. Mahnung ab `))).toBeVisible();
});

test('imports a camt.054, books by QR reference and assigns the rest by hand', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/finance/invoices/new');
	await page.getByRole('combobox').first().click();
	await page.getByRole('option').nth(1).click();
	await page.getByLabel('Beschreibung').first().fill('Therapie');
	await page.getByLabel('Preis CHF').first().fill('500');
	await page.getByLabel('Preis CHF').first().blur();
	await page.getByRole('button', { name: 'Rechnung stellen' }).click();
	await expect(page.getByText('PDF/A archiviert')).toBeVisible();
	const number = (await page.getByRole('heading', { level: 1 }).innerText()).replace('Rechnung ', '');
	const invoiceUrl = page.url();
	const fixture = readFileSync(
		new URL('../../../../packages/domain/test/fixtures/camt054.xml', import.meta.url),
		'utf8',
	);
	const content = fixture
		.replace('00 00000 00000 00000 02026 00427', qrReference(number))
		.replace('129.70', '100.00')
		.replace('RF61 2026 0043', 'RF71 9999 0001');
	const file = { name: 'camt054-test.xml', mimeType: 'application/xml', buffer: Buffer.from(content) };

	await page.goto('/#/finance/payments');
	await page.getByLabel('Datei wählen').setInputFiles(file);
	await expect(page.getByText('camt054-test.xml: 3 Gutschriften, 1 verbucht, 0 schon bekannt.')).toBeVisible();
	const open = page.getByRole('list', { name: 'Zuzuordnende Gutschriften' });
	await expect(open.getByRole('listitem')).toHaveCount(2);
	const bruno = open.getByRole('listitem').filter({ hasText: 'Bruno Häfliger & Co' });
	await bruno.getByRole('combobox', { name: 'Andere Rechnung …' }).click();
	await page.getByRole('option', { name: new RegExp(`^${number} · `) }).click();
	await expect(page.getByText('Zahlung über CHF 280.45 verbucht', { exact: false })).toBeVisible();
	await expect(open.getByRole('listitem')).toHaveCount(1);
	await open.getByRole('button', { name: 'Ignorieren' }).click();
	await expect(page.getByText('Alle Gutschriften sind zugeordnet.')).toBeVisible();

	// The same file again books nothing.
	await page.getByLabel('Datei wählen').setInputFiles(file);
	await expect(page.getByText('camt054-test.xml wurde schon importiert.', { exact: false })).toBeVisible();

	await page.goto(invoiceUrl);
	await expect(page.getByRole('listitem').filter({ hasText: /^05\.12\.2026/ })).toHaveCount(2);
});

test('sets up a sender domain and a business sender that invoices go out from', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/settings/mail');
	await page.getByLabel('Domain', { exact: true }).fill('praxis-sonne.ch');
	await page.getByRole('button', { name: 'Domain hinzufügen' }).click();
	const domain = page.getByRole('article', { name: 'praxis-sonne.ch' });
	await expect(domain.getByText('Ausstehend')).toBeVisible();
	const records = domain.getByRole('list', { name: 'DNS-Einträge für praxis-sonne.ch' });
	await expect(records.getByRole('listitem')).toHaveCount(3);
	await expect(records).toContainText('v=spf1 include:_spf.clinks.ch ~all');
	await expect(records).toContainText(/clinks-\w+\._domainkey\.praxis-sonne\.ch/);
	await domain.getByRole('button', { name: 'Prüfen' }).click();
	await expect(domain.getByText('Bestätigt')).toBeVisible();

	await page.getByRole('button', { name: 'Geschäftsabsender' }).click();
	const dialog = page.getByRole('dialog', { name: 'Geschäftsabsender' });
	await dialog.getByLabel('Adresse').fill('rechnung@other.ch');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog.getByText(/Die Adresse muss auf einer eingetragenen Domain/)).toBeVisible();
	await dialog.getByLabel('Adresse').fill('rechnung@praxis-sonne.ch');
	await dialog.getByLabel('Anzeigename').fill('Praxis Sonne Buchhaltung');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog).toBeHidden();
	const row = page.getByRole('row').filter({ hasText: 'rechnung@praxis-sonne.ch' });
	await expect(row).toContainText('Aktiv');
	await page.getByRole('button', { name: 'Ablage-Adresse erstellen' }).click();
	await expect(page.getByText(/^ablage-[a-z0-9]{10}@in\.clinks\.ch$/)).toBeVisible();

	// Invoices now go out from it (in the demo: Mail › Gesendet).
	await page.goto('/#/finance/invoices/new');
	await page.getByRole('combobox').first().click();
	await page.getByRole('option').nth(1).click();
	await page.getByLabel('Beschreibung').first().fill('Behandlung');
	await page.getByLabel('Preis CHF').first().fill('80');
	await page.getByLabel('Preis CHF').first().blur();
	await page.getByRole('button', { name: 'Rechnung stellen' }).click();
	await expect(page.getByText('PDF/A archiviert')).toBeVisible();
	await page.getByRole('button', { name: 'Senden', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Senden' }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page.getByText(/^Physio · von|^Sicherer Link · von/).first()).toBeVisible();
	await page.goto('/#/mail');
	await page.getByRole('button', { name: /^Gesendet/ }).click();
	await page
		.getByText(/^Rechnung \d{4}-\d{4} von/)
		.first()
		.click();
	await expect(page.getByText('Praxis Sonne Buchhaltung').first()).toBeVisible();
});

test('takes a sent mail back with «Senden rückgängig» and opens it again', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/mail');
	await page.getByRole('button', { name: 'Neue Mail' }).click();
	const sheet = page.getByRole('dialog', { name: 'Neue Mail' });
	await sheet.getByLabel('An', { exact: true }).fill('zurueck@example.org');
	await sheet.getByLabel('An', { exact: true }).press('Enter');
	await sheet.getByLabel('Betreff').fill('Doch noch nicht');
	await sheet.getByRole('button', { name: 'Senden' }).click();
	await expect(sheet).toBeHidden();
	await page.getByRole('button', { name: 'Senden rückgängig' }).click();
	await expect(page.getByText('Nicht gesendet – die Mail ist wieder offen')).toBeVisible();
	await expect(sheet.getByLabel('Betreff')).toHaveValue('Doch noch nicht');
	// Closing it offers to keep it as a draft: it was taken back, not sent.
	await sheet.getByRole('button', { name: 'Schliessen' }).click();
	await page
		.getByRole('dialog', { name: 'Entwurf speichern?' })
		.getByRole('button', { name: 'Als Entwurf speichern' })
		.click();
	await page.getByRole('button', { name: /^Entwürfe/ }).click();
	await expect(page.getByText('Doch noch nicht')).toHaveCount(1);
	await page.getByRole('button', { name: /^Gesendet/ }).click();
	await expect(page.getByText('Doch noch nicht')).toHaveCount(0);
});

test('sends a template to two recipients, each with their placeholders filled, and an attachment', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/mail');
	await page.getByRole('button', { name: 'Neue Mail' }).click();
	const sheet = page.getByRole('dialog', { name: 'Neue Mail' });
	const to = sheet.getByLabel('An', { exact: true });
	await to.fill('example');
	const suggestion = sheet.locator('ul button').first();
	const [name] = (await suggestion.innerText()).split('\n');
	await suggestion.click();
	await to.fill('neu@example.org');
	await to.press('Enter');
	await sheet.getByRole('button', { name: 'Vorlagen' }).click();
	await page.getByRole('menuitem', { name: 'Terminbestätigung' }).click();
	await expect(sheet.getByLabel('Betreff')).toHaveValue('Ihr Termin bei {firma}');
	await expect(sheet.getByTestId('placeholder-hint')).toBeVisible();
	await sheet.getByRole('button', { name: 'Dokument anhängen' }).click();
	const document = page.getByRole('option').first();
	const attachment = await document.innerText();
	await document.click();
	await expect(sheet.getByRole('button', { name: `${attachment} entfernen` })).toBeVisible();
	await sheet.getByRole('button', { name: 'Senden' }).click();
	await expect(page.getByText('2 Mails in Versand gegeben')).toBeVisible();
	await expect(sheet).toBeHidden();

	await page.getByRole('button', { name: /^Gesendet/ }).click();
	const sent = page.getByText(/^Ihr Termin bei /);
	await expect(sent).toHaveCount(2);
	await expect(sent.first()).not.toContainText('{firma}');
	await page.getByRole('button').filter({ hasText: name.trim() }).filter({ hasText: 'Ihr Termin bei' }).first().click();
	await expect(page.getByRole('article').getByText(`Guten Tag ${name.trim()}`)).toBeVisible();
});

test('signs up for the newsletter with double opt-in, sends a campaign with a second approver and unsubscribes', async ({
	page,
}) => {
	await signIn(page);
	await page.goto('/#/settings/mail');
	await page.getByRole('button', { name: 'Anmeldeformular erstellen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Anmeldeformular' });
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('img', { name: 'QR-Code für «Unser Newsletter»' })).toBeVisible();
	const link = await page.getByRole('link', { name: /#\/newsletter\// }).getAttribute('href');

	// The public page: nothing happens without the consent box, then the confirmation link (shown in the demo).
	await page.goto(link!);
	await expect(page.getByRole('heading', { name: 'Unser Newsletter' })).toBeVisible();
	await page.getByLabel('Vorname').fill('Mia');
	await page.getByLabel('Nachname').fill('Sommer');
	await page.getByRole('textbox', { name: 'E-Mail' }).fill('mia.sommer@example.org');
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page.getByText('Bitte bestätigen Sie die Einwilligung.')).toBeVisible();
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page.getByRole('heading', { name: 'Bitte bestätigen Sie die Mail' })).toBeVisible();
	await page.getByRole('link', { name: /Bestätigungslink öffnen/ }).click();
	await expect(page.getByText(/Danke! Sie erhalten ab jetzt den Newsletter von Stille Physio/)).toBeVisible();

	await page.goto('/#/contacts');
	await page.getByRole('searchbox', { name: 'Name, E-Mail, Telefon, Ort …' }).fill('Mia Sommer');
	await page.getByRole('link', { name: 'Mia Sommer' }).first().click();
	const card = page
		.getByRole('region', { name: 'Newsletter' })
		.or(page.locator('section').filter({ hasText: /^Newsletter/ }));
	await expect(card.getByText('Angemeldet').first()).toBeVisible();
	await expect(card.getByText(/Anmeldeformular \(bestätigt\)/)).toBeVisible();

	// A campaign to the «Newsletter» tag: its sender may not approve it alone.
	await page.goto('/#/mail/campaigns');
	await page.getByText('Rückenkurs Frühling').first().click();
	await expect(page.getByTestId('health-notice')).toBeVisible();
	await page.getByRole('button', { name: 'Zur Prüfung einreichen' }).click();
	await expect(page.getByText('Wartet auf Freigabe')).toBeVisible();
	await page.getByRole('button', { name: 'Freigeben' }).click();
	await expect(page.getByText('Eine zweite Person muss die Kampagne freigeben.')).toBeVisible();
	const campaignUrl = page.url();

	await switchAccount(page, 'nicole.weber@stille.ch');
	await page.goto(campaignUrl);
	await page.getByRole('button', { name: 'Freigeben' }).click();
	await expect(page.getByText('Kampagne freigegeben')).toBeVisible();
	await page.getByRole('tab', { name: /Prüfung/ }).click();
	const sendNow = page.getByRole('button', { name: /^Jetzt an \d+ senden$/ });
	const count = Number(/\d+/.exec((await sendNow.innerText()) ?? '')![0]);
	expect(count).toBeGreaterThan(0);
	await sendNow.click();
	await expect(page.getByText('Kampagne geht jetzt raus')).toBeVisible();
	await page.getByRole('tab', { name: 'Ergebnisse' }).click();
	await expect(page.getByText('CLinks zählt keine Öffnungen und Klicks', { exact: false })).toBeVisible();

	// The recipient's unsubscribe page: opening it changes nothing, the button does.
	await page.getByRole('link', { name: /Abmeldeseite ansehen/ }).click();
	await expect(page.getByRole('heading', { name: 'Newsletter von Stille Physio abbestellen' })).toBeVisible();
	await page.getByRole('button', { name: 'Abmelden' }).click();
	await expect(page.getByRole('heading', { name: 'Sie sind abgemeldet' })).toBeVisible();
	await page.getByLabel(/Möchten Sie uns sagen, warum/).fill('Zu viele Mails');
	await page.getByRole('button', { name: 'Senden' }).click();
	await expect(page.getByText('Danke für Ihre Rückmeldung.')).toBeVisible();
});

test('turns on appointment reminders for the workspace and off for one contact', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/settings/mail');
	const card = page.locator('[data-slot=card]').filter({ has: page.getByRole('heading', { name: 'Termine' }) });
	await expect(card.getByLabel('Stunden vorher')).toBeDisabled();
	await card.getByRole('switch').nth(1).click();
	await card.getByLabel('Stunden vorher').fill('48');
	await expect(card.getByRole('radio', { name: 'SMS (folgt)' })).toBeDisabled();
	await card.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Terminmails gespeichert')).toBeVisible();
	await page.reload();
	await expect(card.getByLabel('Stunden vorher')).toHaveValue('48');

	await page.goto('/#/contacts?new=1');
	await page.getByLabel('Vorname').fill('Rita');
	await page.getByLabel('Nachname').fill('Termin');
	await page.getByRole('textbox', { name: 'E-Mail' }).fill('rita.termin@example.ch');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Rita Termin' })).toBeVisible();
	const mails = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Terminmails' }) });
	await expect(mails.getByRole('switch')).toBeChecked();
	await mails.getByRole('switch').click();
	await expect(page.getByText('Terminmails ausgeschaltet')).toBeVisible();
	await expect(mails.getByRole('switch')).not.toBeChecked();
});

test('offers the calendar basics in every calendar view: hidden weekdays per view and the small calendar', async ({
	page,
}) => {
	await signIn(page);
	await page.goto('/#/settings/mail');
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	const strip = page.getByRole('group', { name: 'Woche' }).first();
	await expect(strip.getByRole('button')).toHaveCount(7);
	await page.getByRole('button', { name: 'Wochentage anzeigen' }).click();
	await page.getByRole('menuitemcheckbox', { name: 'Sonntag' }).click();
	await page.keyboard.press('Escape');
	await expect(strip.getByRole('button')).toHaveCount(6);
	await expect(page.getByRole('button', { name: 'So ausgeblendet' })).toBeVisible();

	// The calendar keeps its own days.
	await page.goto('/#/calendar?view=week');
	await expect(page.getByRole('heading', { level: 1, name: 'Kalender' })).toBeVisible();
	await expect(page.getByRole('button', { name: /ausgeblendet/ })).toHaveCount(0);

	// The staff page has the small calendar now too.
	await page.goto('/#/spitex');
	await page
		.getByRole('link', { name: /Daniel Moser/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: /^KW \d+ · / })).toBeVisible();
	await page.getByRole('button', { name: 'Weiter' }).click();
	await page.getByRole('button', { name: 'Heute', exact: true }).click();
	await expect(page.getByRole('heading', { name: /^KW \d+ · / })).toBeVisible();
});

test('writes to a contact’s address in CLinks or the mail program, and remembers the choice', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/contacts?new=1');
	await page.getByLabel('Vorname').fill('Mona');
	await page.getByLabel('Nachname').fill('Mail');
	await page.getByRole('textbox', { name: 'E-Mail' }).fill('mona.mail@example.ch');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Mona Mail' })).toBeVisible();

	await page.getByRole('button', { name: 'E-Mail an mona.mail@example.ch schreiben' }).click();
	const ask = page.getByRole('dialog', { name: 'E-Mail schreiben' });
	await expect(ask.getByRole('button', { name: /Mit dem Mail-Programm des Geräts/ })).toBeVisible();
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 390, height: 844 },
		{ width: 320, height: 568 },
	]) {
		await page.setViewportSize(viewport);
		await expect
			.poll(() =>
				ask.evaluate((dialog) => {
					const bounds = dialog.getBoundingClientRect();
					const options = [...dialog.querySelectorAll('button')].filter(
						(b) => b.textContent?.includes('schreiben') || b.textContent?.includes('Mail-Programm'),
					);
					return (
						options.length === 2 &&
						options.every((button) => {
							const rect = button.getBoundingClientRect();
							return (
								rect.left >= bounds.left && rect.right <= bounds.right && button.scrollWidth <= button.clientWidth + 1
							);
						}) &&
						dialog.scrollWidth <= dialog.clientWidth + 1
					);
				}),
			)
			.toBe(true);
		await page.screenshot({ path: test.info().outputPath('mail-' + viewport.width + '.png') });
	}
	await page.setViewportSize({ width: 1400, height: 900 });
	await ask.getByRole('checkbox').check();
	await ask.getByRole('button', { name: /In CLinks schreiben/ }).click();
	const compose = page.getByRole('dialog', { name: 'Neue Mail' });
	await expect(compose.getByText('mona.mail@example.ch')).toBeVisible();
	await compose.getByRole('button', { name: 'Schliessen' }).click();

	// Remembered: straight to the compose sheet; the profile can change it back.
	await page.getByRole('button', { name: 'E-Mail an mona.mail@example.ch schreiben' }).click();
	await expect(page.getByRole('dialog', { name: 'Neue Mail' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'E-Mail schreiben' })).toHaveCount(0);
	await page.goto('/#/settings/profile');
	await expect(page.getByLabel('E-Mails schreiben mit')).toContainText('CLinks');
});

test('merges duplicates in three columns: equal values greyed, others taken by arrow or by dragging', async ({
	page,
}) => {
	await signIn(page);
	for (const phone of ['032 111 11 11', '079 222 22 22']) {
		await page.goto('/#/contacts?new=1');
		await page.getByLabel('Vorname').fill('Dora');
		await page.getByLabel('Nachname').fill('Doppelt');
		await page.getByRole('textbox', { name: 'E-Mail' }).fill('dora.doppelt@example.ch');
		await page.getByRole('textbox', { name: 'Telefon' }).fill(phone);
		await page.getByRole('button', { name: 'Speichern' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Dora Doppelt' })).toBeVisible();
	}
	await page.goto('/#/contacts');
	await page.getByRole('searchbox', { name: 'Name, E-Mail, Telefon, Ort …' }).fill('Doppelt');
	for (const box of await page.getByRole('checkbox', { name: 'Dora Doppelt auswählen' }).all()) await box.check();
	await page.getByRole('region', { name: 'Auswahl' }).getByRole('button', { name: 'Zusammenführen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Kontakte zusammenführen' });
	await expect(dialog.getByText('1 Felder unterscheiden sich.')).toBeVisible();
	// Equal values offer nothing to take.
	await expect(dialog.getByRole('button', { name: /als E-Mail übernehmen/ })).toHaveCount(0);
	const phone = dialog.getByRole('textbox', { name: 'Telefon' });
	const first = await phone.inputValue();
	const other = first === '032 111 11 11' ? '079 222 22 22' : '032 111 11 11';
	await dialog.getByRole('button', { name: `«${other}» als Telefon übernehmen` }).click();
	await expect(phone).toHaveValue(other);
	await dialog.getByRole('button', { name: `«${first}» als Telefon übernehmen` }).dragTo(phone);
	await expect(phone).toHaveValue(first);
	await phone.fill('031 333 33 33');
	await dialog.getByRole('button', { name: '2 Kontakte zusammenführen' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('main').getByRole('link', { name: 'Dora Doppelt' })).toHaveCount(1);
	await page.getByRole('main').getByRole('link', { name: 'Dora Doppelt' }).click();
	await expect(page.getByText('031 333 33 33')).toBeVisible();
});

test('sets the QR-IBAN and the payment term for invoices', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/settings');
	const invoicing = page.getByRole('region', { name: 'Rechnungen' });
	await expect(invoicing).toBeVisible();
	await invoicing.getByRole('button', { name: '30', exact: true }).click();
	await invoicing.getByRole('textbox', { name: 'Zahlungsfrist in Tagen' }).fill('20');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Zahlungsfrist in Tagen gespeichert')).toBeVisible();
	await page.goto('/#/finance/invoices/new');
	await expect(page.getByLabel('Zahlungsfrist (Tage)')).toHaveValue('20');
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

test('switches the interface to English from a menu with flags, also in the app', async ({ page }) => {
	await page.goto('/#/login');
	await page.getByRole('button', { name: /^Sprachen/ }).click();
	// A menu, not a switch, so more languages fit; each with its flag and its own name.
	const english = page.getByRole('menuitemradio', { name: 'English' });
	await expect(page.getByRole('menuitemradio')).toHaveCount(2);
	await expect(english.locator('svg')).toHaveCount(1);
	await english.click();
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	await expect(page.getByRole('menu')).toBeHidden();

	await page.goto('/#/login');
	await page.getByRole('button', { name: /^Languages/ }).click();
	await page.getByRole('menuitemradio', { name: 'Deutsch (Schweiz)' }).click();
	await signIn(page);
	await page.getByRole('complementary').getByRole('button', { name: 'Sprachen: Deutsch (Schweiz)' }).click();
	await page.getByRole('menuitemradio', { name: 'English' }).click();
	await expect(page.getByRole('link', { name: 'Contacts' }).first()).toBeVisible();
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
	const title = (await visit.locator('span.font-medium').first().textContent())!.trim();
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
	// The entry shows its start and title only; the end and the rest are in the card.
	await expect(appointment).toHaveText(/^\s*\d{2}:\d{2}\s+\S/);
	await expect(appointment).not.toContainText('–');
	await appointment.hover();
	const card = page.getByRole('tooltip');
	await expect(card).toBeVisible();
	await expect(card.getByRole('term')).toContainText(['Art', 'Zuständig']);
	await expect(card).toContainText('Doppelklick öffnet den Termin.');
	await expect(card.getByRole('link', { name: /in Google Maps öffnen/ })).toHaveAttribute('target', '_blank');
	// Described by the card while it is open, but the button keeps its own role: a double click opens the appointment.
	await expect(appointment).toHaveAttribute('aria-describedby', /^peek-/);
	expect(await appointment.getAttribute('aria-expanded')).toBeNull();
	await page.keyboard.press('Escape');
	await expect(card).toBeHidden();
});

test('opens appointments in a panel beside the calendar, which stays usable', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/calendar?view=week');
	const first = page.getByRole('grid').first().getByRole('button').first();
	const panel = page.getByRole('dialog', { name: 'Termin bearbeiten' });
	// One click only marks the appointment; a double click opens it.
	await first.click();
	await expect(first).toHaveAttribute('aria-current', 'true');
	await expect(panel).toBeHidden();
	await first.dblclick();
	await expect(panel.getByLabel('Titel')).toBeFocused();
	const title = await panel.getByLabel('Titel').inputValue();
	// Non-modal: another appointment opens in the same panel.
	const second = page.getByRole('grid').nth(1).getByRole('button').first();
	await second.dblclick();
	await expect(panel.getByLabel('Titel')).not.toHaveValue(title);
	await expect(second).toHaveAttribute('aria-current', 'true');
	await expect(first).not.toHaveAttribute('aria-current');
	// Unsaved edits are not dropped silently when switching.
	await panel.getByLabel('Titel').fill('Geändert');
	await first.dblclick();
	await page.getByRole('button', { name: 'Verwerfen' }).click();
	await expect(panel.getByLabel('Titel')).toHaveValue(title);
	await panel.getByRole('button', { name: 'Schliessen' }).click();
	await expect(panel).toBeHidden();
	// The keyboard has no double click: Enter opens the focused appointment, Escape clears the mark.
	await second.focus();
	await page.keyboard.press('Enter');
	await expect(panel).toBeVisible();
	await panel.getByRole('button', { name: 'Schliessen' }).click();
	await second.focus();
	await page.keyboard.press('Escape');
	await expect(second).not.toHaveAttribute('aria-current');
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

test('shows a client’s arrival window in the plan and drops visits inside it', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	const daniel = page.getByRole('grid', { name: /Daniel Moser/ });
	const item = page
		.getByRole('listitem')
		.filter({ has: page.getByTitle(/zuzuweisen/) })
		.first();
	const [, from, to] = /Ankunft (\d\d:\d\d)–(\d\d:\d\d)/.exec((await item.textContent())!)!;
	const title = (await item.locator('p').first().textContent())!.trim();
	const band = page.locator('[data-arrival-window]');
	await expect(band).toHaveCount(0);
	// Pointing at an open visit marks its window in every column of that day.
	await item.hover();
	await expect(band.first()).toBeVisible();
	await expect(page.locator('[data-arrival-label]')).toHaveText(`Ankunft ${from}–${to}`);
	await page.mouse.move(0, 0);
	await expect(band).toHaveCount(0);
	// Let go further down the column, well after the window: the visit starts at the end of the window instead.
	const column = (await daniel.boundingBox())!;
	const low = (page.viewportSize()!.height - 30 - column.y) / column.height;
	await dragOnto(page, item.getByTitle(/zuzuweisen/), daniel, { x: 0.5, y: low });
	await expect(daniel.getByRole('button').filter({ hasText: title })).toContainText(`${to} ${title}`);
	await expect(page.getByText(`«${title}» zugewiesen`, { exact: false }).first()).toBeVisible();
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

test('edits a client from their open visit, without planning a new visit', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex');
	const card = page
		.getByRole('listitem')
		.filter({ has: page.getByRole('button', { name: 'Zuweisen' }) })
		.first();
	const edit = card.getByRole('button', { name: /^Angaben von .+ bearbeiten$/ });
	await expect(edit).toHaveCSS('opacity', '0');
	await card.hover();
	await expect(edit).toHaveCSS('opacity', '1');
	await edit.click();
	const sheet = page.getByRole('dialog', { name: 'Kontakt bearbeiten' });
	await sheet.getByLabel('Telefon').fill('+41 32 555 66 77');
	await sheet.getByRole('button', { name: 'Speichern' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('dialog', { name: 'Neuer Termin' })).toHaveCount(0);
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

test('hides areas without rights in the navigation and names them «Kein Zugriff» in the search', async ({ page }) => {
	await signIn(page, 'daniel.moser@spitex-seeland.ch');
	const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
	await expect(navigation.getByRole('link', { name: 'Meine Einsätze' })).toBeVisible();
	// Neither booked areas without rights nor unbooked ones show up for staff.
	for (const name of ['Kontakte', 'Finanzen', 'Physio'])
		await expect(navigation.getByRole('link', { name })).toHaveCount(0);

	await page.keyboard.press('ControlOrMeta+k');
	const palette = page.getByRole('dialog', { name: 'Befehle und Suche' });
	await palette.getByRole('combobox').fill('Finanzen');
	const finance = palette.getByRole('option', { name: /Finanzen/ });
	await expect(finance).toContainText('Kein Zugriff');
	await expect(finance).toHaveAttribute('aria-disabled', 'true');
	await palette.getByRole('combobox').fill('Physio');
	await expect(palette.getByRole('option', { name: /Physio/ })).toHaveCount(0);
});

test('acts on mails from the list: hover buttons, Ctrl-click, right-click and undo', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/mail');
	const rows = page.getByRole('list', { name: 'Posteingang' }).getByRole('listitem');
	const first = rows.nth(0);
	const second = rows.nth(1);
	// Hovering shows the buttons for the row; starring needs no opening.
	await first.hover();
	await first.getByRole('button', { name: 'Markieren', exact: true }).click();
	await expect(first.getByRole('button', { name: 'Markierung entfernen' })).toHaveAttribute('aria-pressed', 'true');
	// A click opens the mail beside the list; Ctrl-click adds a second one and the bar for both appears.
	await first.getByRole('button').first().click();
	await expect(page.getByRole('article').getByRole('heading', { level: 2 })).toBeVisible();
	await second
		.getByRole('button')
		.first()
		.click({ modifiers: ['ControlOrMeta'] });
	const bar = page.getByRole('region', { name: 'Auswahl' });
	await expect(bar).toContainText('2 ausgewählt');
	await bar.getByRole('button', { name: 'Archivieren' }).click();
	await expect(page.getByText('2 Mails verschoben nach Archiv')).toBeVisible();
	await expect(bar).toBeHidden();
	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(page.getByText('Rückgängig gemacht')).toBeVisible();
	// Right-click: the same actions as a menu.
	await rows.nth(0).click({ button: 'right' });
	await expect(page.getByRole('menuitem', { name: 'Antworten' })).toBeVisible();
	await page.keyboard.press('Escape');
	// Ctrl+A selects every mail of the folder, Escape clears the selection.
	await rows.nth(0).getByRole('button').first().focus();
	await page.keyboard.press('ControlOrMeta+a');
	await expect(bar).toContainText(`${await rows.count()} ausgewählt`);
	await page.keyboard.press('Escape');
	await expect(bar).toBeHidden();
});

test('marks files with a click, opens them with a double click and moves several at once', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/documents');
	// The search lists the files of every folder.
	await page.getByRole('searchbox', { name: 'Dateien suchen' }).fill('.');
	const rows = page.getByRole('list', { name: 'Dateien' }).getByRole('listitem');
	const first = rows.nth(0);
	const name = (await first.getByRole('button').first().innerText()).split('\n')[0].trim();
	await first.getByRole('button').first().click();
	await expect(first.getByRole('button').first()).toHaveAttribute('aria-current', 'true');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await first.getByRole('button').first().dblclick();
	await expect(page.getByRole('dialog', { name })).toBeVisible();
	await page.keyboard.press('Escape');
	// Shift-click picks the range; the bar's menu moves all of them.
	await rows
		.nth(1)
		.getByRole('button')
		.first()
		.click({ modifiers: ['Shift'] });
	const bar = page.getByRole('region', { name: 'Auswahl' });
	await expect(bar).toContainText('2 ausgewählt');
	await bar.getByRole('button', { name: 'Weitere Aktionen' }).click();
	await page.getByRole('menuitem', { name: 'Verschieben nach' }).click();
	// «Belege» holds no files yet, so both move.
	await page.getByRole('menuitem', { name: 'Belege', exact: true }).click();
	await expect(page.getByText('2 Dateien verschoben')).toBeVisible();
	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(rows.filter({ hasText: name })).toHaveCount(1);
});

test('works the mail and the files with the keyboard and lists the keys under «?»', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/mail');
	const rows = page.getByRole('list', { name: 'Posteingang' }).getByRole('listitem');
	await expect(rows.first()).toBeVisible();
	const count = await rows.count();
	// ↓ opens the first mail, S stars it, E archives it.
	await page.keyboard.press('ArrowDown');
	await expect(rows.first().getByRole('button').first()).toBeFocused();
	await expect(page.getByRole('article').getByRole('heading', { level: 2 })).toBeVisible();
	const star = page.getByRole('article').getByRole('button', { name: /^(Markieren|Markierung entfernen)$/ });
	const wasStarred = (await star.getAttribute('aria-pressed')) === 'true';
	await page.keyboard.press('s');
	await expect(star).toHaveAttribute('aria-pressed', String(!wasStarred));
	await page.keyboard.press('e');
	await expect(page.getByText('Verschoben nach Archiv')).toBeVisible();
	await expect(rows).toHaveCount(count - 1);
	await page.keyboard.press('?');
	const overview = page.getByRole('dialog', { name: 'Tastenkürzel' });
	await expect(overview.getByRole('region', { name: 'Auf dieser Seite' })).toContainText('Antworten');
	await page.keyboard.press('Escape');

	await page.goto('/#/documents');
	await page
		.getByRole('button', { name: /^Formulare/ })
		.first()
		.click();
	const files = page.getByRole('list', { name: 'Dateien' }).getByRole('listitem');
	await expect(files.first()).toBeVisible();
	await page.getByRole('heading', { level: 1 }).click();
	await page.keyboard.press('ArrowDown');
	await expect(files.first().getByRole('button').first()).toHaveAttribute('aria-current', 'true');
	await page.keyboard.press('F2');
	await expect(page.getByRole('dialog', { name: 'Umbenennen' })).toBeVisible();
	await page.keyboard.press('Escape');
	// Backspace goes up to the parent folder.
	await page.getByRole('heading', { level: 1 }).click();
	await page.keyboard.press('Backspace');
	await expect(page.getByRole('navigation', { name: 'Ordnerpfad' }).getByRole('button')).toHaveCount(1);
});

test('answers right under the conversation and drags mails onto a folder or a task', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/mail');
	const rows = page.getByRole('list', { name: 'Posteingang' }).getByRole('listitem');
	await rows.first().getByRole('button').first().click();
	const reader = page.getByRole('article').first();
	const reply = page.getByRole('form', { name: 'Antworten' });
	await reply.getByRole('textbox').fill('Danke, bis dann.');
	await reply.getByRole('textbox').press('ControlOrMeta+Enter');
	await expect(page.getByText('Mail gesendet')).toBeVisible();
	// The answer joins the conversation: the earlier mail folds, the answer is open.
	await expect(page.getByText(/^2 Mails im Verlauf$/)).toBeVisible();
	await expect(reader.page().getByText('Danke, bis dann.')).toBeVisible();

	// Dragging a mail onto «Archiv» moves it; while dragging, «Als Aufgabe» appears as a target too.
	const count = await rows.count();
	await rows.nth(1).dragTo(page.getByRole('navigation', { name: 'Ordner' }).getByRole('button', { name: 'Archiv' }));
	await expect(page.getByText('Verschoben nach Archiv')).toBeVisible();
	await expect(rows).toHaveCount(count - 1);
	// The target only exists once the drag started, so the mouse is moved by hand.
	await rows.nth(1).hover();
	await page.mouse.down();
	await page.mouse.move(400, 300, { steps: 5 });
	const task = page.getByRole('navigation', { name: 'Ordner' }).getByText('Als Aufgabe', { exact: true });
	const box = (await task.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	await expect(page.getByText('Aufgabe aus Mail erstellt')).toBeVisible();
});

test('filters the search, snoozes a mail until tomorrow and shows what CLinks knows about the sender', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/mail');
	const folders = page.getByRole('navigation', { name: 'Ordner' });
	const rows = page.getByRole('list', { name: 'Posteingang' }).getByRole('listitem');
	await expect(rows.first()).toBeVisible();
	const unread = Number(
		await folders
			.getByRole('button', { name: /^Posteingang/ })
			.innerText()
			.then((text) => text.match(/\d+/)?.[0] ?? '0'),
	);
	await page.getByRole('searchbox', { name: 'Mails durchsuchen' }).fill('ist:ungelesen');
	await expect(page.getByText(/^Filter: von:/)).toBeVisible();
	await expect(rows).toHaveCount(unread);
	await page.getByRole('searchbox', { name: 'Mails durchsuchen' }).fill('');

	// Später erinnern: out of the inbox, under «Zurückgestellt» until tomorrow.
	const count = await rows.count();
	await rows.first().click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Später erinnern' }).click();
	await page.getByRole('menuitem', { name: /^Morgen früh/ }).click();
	await expect(page.getByText(/^Zurückgestellt bis /)).toBeVisible();
	await expect(rows).toHaveCount(count - 1);
	await folders.getByRole('button', { name: /^Zurückgestellt/ }).click();
	const snoozed = page.getByRole('list', { name: 'Zurückgestellt' }).getByRole('listitem');
	await expect(snoozed).toHaveCount(1);
	await snoozed.first().hover();
	await snoozed.first().getByRole('button', { name: 'Jetzt zurückholen' }).click();
	await expect(page.getByText('Zurück im Ordner')).toBeVisible();

	// The sender's name in an open mail opens a card about them.
	await folders.getByRole('button', { name: /^Posteingang/ }).click();
	await rows.first().getByRole('button').first().click();
	await page.getByRole('article').first().locator('[data-slot="hover-card-trigger"]').first().hover();
	await expect(page.getByRole('group', { name: /^Über / })).toBeVisible();
});

test('shows files as tiles, sorts them, previews the marked one and pins folders like Explorer', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/documents');
	const files = page.getByRole('list', { name: 'Dateien' }).getByRole('listitem');
	// Pinning a folder puts it at the top of the sidebar.
	await page.getByRole('button', { name: 'Aktionen für «Formulare»' }).last().click();
	await page.getByRole('menuitem', { name: 'Anheften' }).click();
	await expect(page.getByRole('navigation', { name: 'Angeheftet' })).toContainText('Formulare');
	// Dropping a file on a step of the path moves it there.
	await page.getByRole('navigation', { name: 'Angeheftet' }).getByRole('button', { name: 'Formulare' }).click();
	await files
		.first()
		.dragTo(page.getByRole('navigation', { name: 'Ordnerpfad' }).getByRole('button', { name: 'Alle Dateien' }));
	await expect(page.getByText('Verschoben', { exact: true })).toBeVisible();

	await page.getByRole('navigation', { name: 'Ordnerpfad' }).getByRole('button', { name: 'Alle Dateien' }).click();
	await page.getByRole('searchbox', { name: 'Dateien suchen' }).fill('.');
	await page.getByRole('button', { name: 'Sortieren nach Grösse' }).click();
	await expect(page.getByRole('button', { name: 'Sortieren nach Grösse' })).toHaveAttribute('aria-pressed', 'true');
	// A marked file shows beside the list; opening it adds it to «Zuletzt geöffnet».
	await files.first().getByRole('button').first().click();
	const name = (await files.first().getByRole('button').first().innerText()).split('\n')[0].trim();
	await expect(page.getByRole('complementary', { name: `Details zu ${name}` })).toBeVisible();
	await files.first().getByRole('button').first().dblclick();
	await expect(page.getByRole('dialog', { name })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name })).toBeHidden();
	await expect(page.getByRole('navigation', { name: 'Zuletzt geöffnet' })).toContainText(name);
	// Several files download as one ZIP.
	await page.keyboard.press('ControlOrMeta+a');
	const download = page.waitForEvent('download');
	await page.getByRole('region', { name: 'Auswahl' }).getByRole('button', { name: 'Als ZIP herunterladen' }).click();
	expect((await download).suggestedFilename()).toBe('Alle Dateien.zip');
	await page.keyboard.press('Escape');
	// Tiles: the same files with a picture.
	await page.getByRole('button', { name: 'Karten' }).click();
	await expect(files.first().locator('img, svg').first()).toBeVisible();
	await page.getByRole('button', { name: 'Tabelle' }).click();
});

test('finds a file by its text and shares it by a link that works without an account', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/documents');
	await page.getByRole('searchbox', { name: 'Dateien suchen' }).fill('Laufzeit');
	const files = page.getByRole('list', { name: 'Dateien' }).getByRole('listitem');
	await expect(files).toHaveCount(1);
	await expect(files.first()).toContainText('Mietvertrag Praxis.txt');
	await expect(files.first()).toContainText('Laufzeit bis 2029');

	await files.first().click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Teilen-Link' }).click();
	const dialog = page.getByRole('dialog', { name: 'Teilen-Link' });
	await dialog.getByRole('button', { name: '1 Woche' }).click();
	await dialog.getByRole('button', { name: 'Link erstellen' }).click();
	const link = await dialog.getByRole('textbox', { name: 'Link zum Teilen' }).inputValue();
	expect(link).toMatch(/#\/share\/[0-9a-f]{32}$/);
	await expect(dialog.getByRole('region', { name: 'Aktive Links' })).toContainText('0× geöffnet');
	await page.keyboard.press('Escape');

	await page.goto(link.slice(link.indexOf('#') - 1).replace(/^\//, '/'));
	await expect(page.getByRole('heading', { name: 'Mietvertrag Praxis.txt' })).toBeVisible();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Herunterladen' }).click();
	expect((await download).suggestedFilename()).toBe('Mietvertrag Praxis.txt');
});

const scanPhoto = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAADwAAABQCAIAAADKqIEEAAAAkklEQVR4Xu3bsQkDMRBFwbvDxagE9R+pLOPQyYUDC28a0Oexqe611jXNM23wT6OVSiuVViqtfN4fOueoJX/23i/vdh5KpZVKK5VWKq1UWqm0Umml0kqllUorlVYqrVRaqbRSaaXSSqWVSiuVViqtVFqptFJppdJKpZVKK5VWKq2MLH33+wIZeR6NViqtVFoZWfoL6jcEkd0RupUAAAAASUVORK5CYII=',
	'base64',
);

test('scans two pages into one PDF, takes files shared into CLinks and keeps a folder offline', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page);
	await page.goto('/#/documents');
	await page.getByRole('button', { name: 'Scannen' }).click();
	const scan = page.getByRole('dialog', { name: 'Scannen' });
	const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: scanPhoto });
	await scan.getByLabel('Seite fotografieren').setInputFiles([photo('seite-1.png'), photo('seite-2.png')]);
	await expect(scan.getByRole('img', { name: 'Seite 2' })).toBeVisible();
	await scan.getByRole('button', { name: 'Drehen' }).first().click();
	await scan.getByLabel('Name').fill('Arztzeugnis');
	await scan.getByRole('button', { name: 'Als PDF speichern (2 Seiten)' }).click();
	await expect(page.getByText('«Arztzeugnis.pdf» hochgeladen')).toBeVisible();
	await expect(page.getByRole('list', { name: 'Dateien' })).toContainText('Arztzeugnis.pdf');

	// «Teilen → CLinks»: the service worker leaves the file in the shared-files cache and opens the page.
	await page.evaluate(async () => {
		const cache = await caches.open('clinks-shared-files');
		await cache.put(
			new URL('shared/test', location.href).href,
			new Response('Laborwerte', { headers: { 'content-type': 'text/plain', 'x-file-name': 'Labor.txt' } }),
		);
	});
	await page.goto('/#/documents?shared=1');
	const shared = page.getByRole('dialog', { name: 'In CLinks speichern' });
	await expect(shared).toContainText('Labor.txt');
	await shared.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('«Labor.txt» hochgeladen')).toBeVisible();

	// Offline: the folder's files are marked as kept on the device.
	await page.getByRole('button', { name: 'Aktionen für «Verträge»' }).last().click();
	await page.getByRole('menuitem', { name: 'Offline verfügbar machen' }).click();
	await expect(page.getByText('«Verträge» ist auf diesem Gerät offline verfügbar')).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Ordner' })
		.getByRole('button', { name: /^Verträge/ })
		.click();
	await expect(page.getByRole('list', { name: 'Dateien' }).getByLabel('Offline verfügbar').first()).toBeVisible();
});

test('keeps the shortcuts dialog reachable on a landscape phone', async ({ page }) => {
	await signIn(page);
	await page.goto('/#/mail');
	await page.getByRole('button', { name: 'Kontomenü' }).click();
	await page.getByRole('menuitem', { name: /Tastenkürzel/ }).click();
	const overview = page.getByRole('dialog', { name: 'Tastenkürzel' });
	await page.setViewportSize({ width: 844, height: 390 });
	await expect
		.poll(() =>
			overview.evaluate((dialog) => {
				const rect = dialog.getBoundingClientRect();
				return rect.top >= 0 && rect.bottom <= innerHeight && dialog.scrollHeight > dialog.clientHeight;
			}),
		)
		.toBe(true);
	await overview.locator('kbd').last().scrollIntoViewIfNeeded();
	await expect(overview.locator('kbd').last()).toBeInViewport();
	await page.screenshot({ path: test.info().outputPath('shortcuts-landscape.png') });
	await page.keyboard.press('Escape');
	await expect(overview).toHaveCount(0);
});

test('shows every open dashboard visit when eight appointments share a planning link', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.evaluate(() => {
		const key = 'clinks.workspace.database.v1';
		const snapshot = JSON.parse(localStorage.getItem(key)!);
		const sample = snapshot.appointments.find((a: { kind: string }) => a.kind === 'spitex');
		const tomorrow = new Date();
		tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
		tomorrow.setUTCHours(10, 0, 0, 0);
		snapshot.invoices = [];
		snapshot.tasks = [];
		snapshot.appointments = Array.from({ length: 8 }, (_, index) => ({
			...sample,
			id: crypto.randomUUID(),
			title: 'Testbesuch ' + (index + 1),
			start: tomorrow.toISOString(),
			end: new Date(+tomorrow + 3600000).toISOString(),
			contactId: null,
			assigneeId: null,
			kind: 'spitex',
			status: 'planned',
		}));
		localStorage.setItem(key, JSON.stringify(snapshot));
	});
	await page.reload();
	const visits = page.getByRole('link', { name: /Testbesuch/ });
	await expect(visits).toHaveCount(6);
	await page.getByText('2 weitere', { exact: true }).click();
	await expect(visits).toHaveCount(8);
	expect(new Set(await visits.evaluateAll((links) => links.map((link) => link.getAttribute('href')))).size).toBe(1);
});
test('plans a recurring client activity and checks the phone form', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	await page.goto('/#/spitex/clients');
	await page.locator('tbody tr').first().click();
	const section = page.getByRole('region', { name: 'Wiederkehrender Pflegebedarf' });
	await section.getByRole('button', { name: 'Bedarf planen' }).click();
	await section.getByLabel('Tätigkeit').fill('Einkauf begleiten');
	await section.getByLabel('Notizen').fill('Gemeinsam die Einkaufsliste mitnehmen.');
	for (const width of [1440, 390, 320]) {
		await page.setViewportSize({ width, height: 844 });
		await expect(section.getByRole('button', { name: '1 offenen Einsatz anlegen' })).toBeEnabled();
		await expect
			.poll(() =>
				section.evaluate((el) =>
					[el.scrollWidth - el.clientWidth, document.documentElement.scrollWidth - innerWidth].every(
						(excess) => excess <= 1,
					),
				),
			)
			.toBe(true);
		await section.screenshot({ path: test.info().outputPath('visit-need-' + width + '.png') });
	}
	await section.getByRole('button', { name: '1 offenen Einsatz anlegen' }).click();
	await expect(section.getByText('Einkauf begleiten', { exact: true })).toBeVisible();
	await section.getByRole('button', { name: 'Nächsten Zeitraum planen' }).click();
	await expect(section.getByLabel('Planen ab')).toHaveValue('2026-11-30');
	const clientName = (await page.title()).split(' · ')[0];
	await page.goto('/#/spitex?date=2026-11-23');
	const cards = page.getByRole('list').filter({ has: page.getByTitle(/zuzuweisen/) });
	await expect(cards.getByText(clientName, { exact: true }).first()).toBeVisible();
	await expect(cards).not.toContainText('Einkauf begleiten');
});
