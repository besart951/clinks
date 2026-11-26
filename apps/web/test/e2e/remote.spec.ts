import { readFileSync } from 'node:fs';
import { newId } from '@clinks/domain/ids';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { failOnCspViolations } from './csp-guard.ts';

failOnCspViolations();

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

	// With changes still waiting for upload, signing out asks first (and the test browser would cancel that):
	// wait until everything is saved, as a careful user would.
	await expect(page.getByRole('status', { name: 'Sync-Status' })).toContainText('Alles gespeichert', {
		timeout: 30_000,
	});
	await page.getByRole('button', { name: 'Kontomenü' }).click();
	await page.getByRole('menuitem', { name: 'Abmelden' }).click();
	// Signing out wipes the local database first, which takes a moment on a slow runner.
	await expect(page).toHaveURL(/#\/login/, { timeout: 15_000 });
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

const apiUrl = process.env.VITE_API_URL ?? 'http://localhost:8787';

/** One call to the API, as a script would make it: the token goes in, JSON comes back. */
async function api<T>(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
	const response = await fetch(`${apiUrl}${path}`, {
		method,
		headers: {
			'X-Clinks-Client': 'web',
			...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
			...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	const text = await response.text();
	if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
	return (text ? JSON.parse(text) : null) as T;
}

/** The newest mail to `email` whose subject matches, with its full text. */
async function mailFor(email: string, subject: RegExp): Promise<string> {
	for (let attempt = 0; attempt < 40; attempt++) {
		const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
		const { messages } = (await response.json()) as { messages: { ID: string; Subject: string }[] };
		const match = messages.find((message) => subject.test(message.Subject));
		if (match) {
			const message = (await (await fetch(`${mailpit}/api/v1/message/${match.ID}`)).json()) as { Text: string };
			return message.Text;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`no mail «${subject}» to ${email}`);
}

test('releases the Spitex plan: staff get their own visits on their device, and lose them again', async ({
	browser,
}) => {
	test.setTimeout(180_000);
	const stamp = Date.now();
	const plannerEmail = `plan-${stamp}@example.ch`;
	const staffEmail = `staff-${stamp}@example.ch`;
	const write = (token: string, ops: unknown[]) => api('POST', '/sync/write', { token, body: { ops } });

	// A planner with a Spitex tenant, a role that only sees its own visits, and one staff member in it.
	const signUp = await api<{ verificationId: string }>('POST', '/auth/sign-up', {
		body: { firstName: 'Paula', lastName: 'Planerin', email: plannerEmail, password },
	});
	const verified = await api<{ accessToken: string }>('POST', '/auth/verify-email', {
		body: { verificationId: signUp.verificationId, code: await codeFor(plannerEmail) },
	});
	const tenant = await api<{ tenantId: string }>('POST', '/tenants', {
		token: verified.accessToken,
		body: { name: 'Spitex Freigabe', industry: 'spitex', modules: ['spitex', 'planner'] },
	});
	const planner = (
		await api<{ accessToken: string }>('POST', '/me/tenant', {
			token: verified.accessToken,
			body: { tenantId: tenant.tenantId },
		})
	).accessToken;
	const plannerId = (await api<{ user: { id: string } }>('GET', '/me', { token: planner })).user.id;
	const role = await api<{ id: string }>('POST', '/tenant/roles', {
		token: planner,
		body: { id: null, name: 'Spitex-Mitarbeitende', permissions: ['spitex.own.read'] },
	});
	await api('POST', '/tenant/invitations', { token: planner, body: { email: staffEmail, roleId: role.id } });
	const invitation = /invitation\/([A-Za-z0-9_%-]+)/.exec(await mailFor(staffEmail, /Einladung/))![1];
	await api('POST', `/invitations/${invitation}/accept`, {
		body: { firstName: 'Stefan', lastName: 'Staff', password },
	});
	const staffToken = (
		await api<{ session: { accessToken: string } }>('POST', '/auth/sign-in', { body: { email: staffEmail, password } })
	).session.accessToken;
	const staffId = (await api<{ user: { id: string } }>('GET', '/me', { token: staffToken })).user.id;

	// Next week: one client and one visit for the staff member, still a draft.
	const monday = new Date();
	monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7));
	const weekStart = monday.toISOString().slice(0, 10);
	const tuesday = new Date(`${weekStart}T09:00:00.000Z`);
	tuesday.setUTCDate(tuesday.getUTCDate() + 1);
	const [clientId, visitId, releaseId] = [newId<string>(), newId<string>(), newId<string>()];
	await write(planner, [
		{
			op: 'PUT',
			table: 'contacts',
			id: clientId,
			data: {
				kind: 'person',
				first_name: 'Rosa',
				last_name: 'Klientin',
				company_name: '',
				email: 'rosa@example.ch',
				phone: '+41 32 555 01 01',
				address: JSON.stringify({ street: 'Seeweg', houseNumber: '5', zip: '3250', city: 'Lyss' }),
				insurer: 'Geheime Kasse',
				tags: JSON.stringify(['Klient:in']),
				notes: 'Nur für die Planung',
				archived: 0,
			},
		},
		{
			op: 'PUT',
			table: 'appointments',
			id: visitId,
			data: {
				title: 'Rosa Klientin',
				kind: 'spitex',
				status: 'planned',
				contact_id: clientId,
				assignee_id: staffId,
				starts_at: tuesday.toISOString(),
				ends_at: new Date(tuesday.getTime() + 45 * 60_000).toISOString(),
				location: '',
				notes: 'Schlüssel beim Nachbarn',
				service: 'basic_care',
			},
		},
	]);

	const staff = await secondDevice(browser, staffEmail);
	await staff.goto(`/#/visits?week=${weekStart}`);
	const pending = staff.getByText(/Der Plan für KW \d+ ist noch in Arbeit/);
	const visit = staff.getByRole('listitem').filter({ hasText: 'Rosa Klientin' });
	await expect(pending).toBeVisible({ timeout: 30_000 });
	await expect(staff.getByRole('status', { name: 'Sync-Status' })).toContainText('Alles gespeichert', {
		timeout: 30_000,
	});
	await expect(visit).toHaveCount(0);

	// The planner sees the draft in the plan.
	const plan = await secondDevice(browser, plannerEmail);
	await plan.goto(`/#/spitex?date=${tuesday.toISOString().slice(0, 10)}`);
	const status = plan.getByRole('status').filter({ hasText: /KW \d+ ·/ });
	await expect(status).toContainText('Entwurf', { timeout: 30_000 });
	await expect(plan.getByRole('button', { name: /Rosa Klientin/ }).first()).toBeVisible({ timeout: 30_000 });

	// Released: the visit arrives on the staff member's device with what they need of the client, and a mail goes out.
	await write(planner, [
		{
			op: 'PUT',
			table: 'spitex_week_releases',
			id: releaseId,
			data: { week_start: weekStart, released_by: plannerId },
		},
	]);
	await expect(visit).toBeVisible({ timeout: 30_000 });
	await expect(visit).toContainText('Seeweg 5, 3250 Lyss');
	await expect(visit).toContainText('+41 32 555 01 01');
	await expect(visit).toContainText('Schlüssel beim Nachbarn');
	await expect(status).toContainText('Freigegeben', { timeout: 30_000 });
	const mail = await mailFor(staffEmail, /Dein Einsatzplan für KW \d+ ist da/);
	expect(mail).toContain(`/#/visits?week=${weekStart}`);
	expect(mail).not.toContain('Rosa');
	// Nothing else of the client reached the device: no contacts, no plan.
	await staff.goto('/#/contacts');
	await expect(staff.getByText('Kein Zugriff')).toBeVisible();
	await staff.goto(`/#/visits?week=${weekStart}`);
	await expect(visit).toBeVisible();

	// Given to someone else, it leaves the device; given back, it returns.
	await write(planner, [{ op: 'PATCH', table: 'appointments', id: visitId, data: { assignee_id: plannerId } }]);
	await expect(staff.getByText('Keine Einsätze in dieser Woche')).toBeVisible({ timeout: 30_000 });
	await write(planner, [{ op: 'PATCH', table: 'appointments', id: visitId, data: { assignee_id: staffId } }]);
	await expect(visit).toBeVisible({ timeout: 30_000 });
	await expect(visit).toContainText('Geändert');

	// Withdrawn: the week is a draft again and gone from the device.
	await write(planner, [{ op: 'DELETE', table: 'spitex_week_releases', id: releaseId }]);
	await expect(pending).toBeVisible({ timeout: 30_000 });
	await expect(visit).toHaveCount(0);
	await expect(status).toContainText('Entwurf', { timeout: 30_000 });

	await staff.context().close();
	await plan.context().close();
});

test('sends an invoice as a secure link the recipient opens, and books its payment from a camt.054', async ({
	browser,
	page,
}) => {
	test.setTimeout(180_000);
	const email = `rechnung-${Date.now()}@example.ch`;
	const recipient = `patient-${Date.now()}@example.ch`;
	const signUp = await api<{ verificationId: string }>('POST', '/auth/sign-up', {
		body: { firstName: 'Fritz', lastName: 'Finanz', email, password },
	});
	const verified = await api<{ accessToken: string }>('POST', '/auth/verify-email', {
		body: { verificationId: signUp.verificationId, code: await codeFor(email) },
	});
	const tenant = await api<{ tenantId: string }>('POST', '/tenants', {
		token: verified.accessToken,
		body: { name: 'Physio Versand', industry: 'physio', modules: ['physio', 'finance'] },
	});
	const token = (
		await api<{ accessToken: string }>('POST', '/me/tenant', {
			token: verified.accessToken,
			body: { tenantId: tenant.tenantId },
		})
	).accessToken;
	await api('POST', '/tenant/settings', { token, body: { iban: 'CH93 0076 2011 6238 5295 7' } });
	const [contactId, invoiceId] = [newId<string>(), newId<string>()];
	await api('POST', '/sync/write', {
		token,
		body: {
			ops: [
				{
					op: 'PUT',
					table: 'contacts',
					id: contactId,
					data: {
						kind: 'person',
						first_name: 'Paula',
						last_name: 'Patientin',
						company_name: '',
						email: recipient,
						phone: '',
						address: JSON.stringify({ street: 'Seeweg', houseNumber: '5', zip: '3250', city: 'Lyss' }),
						insurer: '',
						tags: '[]',
						notes: '',
						archived: 0,
					},
				},
				{
					op: 'PUT',
					table: 'invoices',
					id: invoiceId,
					data: {
						number: '',
						kind: 'invoice',
						contact_id: contactId,
						issue_date: '2026-11-20',
						due_date: '2026-12-20',
						status: 'open',
						lines: JSON.stringify([{ description: 'Physiotherapie', quantity: 1, unitPrice: 12000, vatRate: 0 }]),
						payments: '[]',
						notes: '',
						appointment_ids: '[]',
						service_from: '2026-11-02',
						service_to: '2026-11-20',
					},
				},
			],
		},
	});

	// The workspace sends it from the invoice page; Physio picks the secure link.
	const office = await secondDevice(browser, email);
	await office.goto(`/#/finance/invoices/${invoiceId}`);
	await expect(office.getByText('PDF/A archiviert')).toBeVisible({ timeout: 20_000 });
	const number = (await office.getByRole('heading', { level: 1 }).innerText()).replace('Rechnung ', '');
	await office.getByRole('button', { name: 'Senden', exact: true }).click();
	const dialog = office.getByRole('dialog');
	await expect(dialog.getByRole('radio', { name: /Sicherer Link/ })).toBeChecked();
	await dialog.getByRole('button', { name: 'Senden' }).click();
	await expect(office.getByText(`Rechnung ${number} an ${recipient} gesendet`)).toBeVisible();

	// The recipient: the mail names no amount; the link opens with the postcode only.
	const mail = await mailFor(recipient, new RegExp(`Rechnung ${number} von Physio Versand`));
	expect(mail).not.toMatch(/120|Physiotherapie/);
	const link = /(\/#\/invoice-link\/[A-Za-z0-9_%-]+)/.exec(mail)![1];
	await page.goto(link);
	await expect(page.getByRole('heading', { level: 1, name: `Rechnung ${number}` })).toBeVisible();
	await page.getByLabel('Postleitzahl').fill('3251');
	await page.getByRole('button', { name: 'PDF herunterladen' }).click();
	await expect(page.getByText('Die Postleitzahl stimmt nicht.')).toBeVisible();
	await page.getByLabel('Postleitzahl').fill('3250');
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'PDF herunterladen' }).click();
	expect((await download).suggestedFilename()).toBe(`Rechnung ${number}.pdf`);

	// The bank file books the payment by its Creditor Reference.
	const { creditorReference } = await import('@clinks/domain/qr-bill');
	const fixture = readFileSync(
		new URL('../../../../packages/domain/test/fixtures/camt054.xml', import.meta.url),
		'utf8',
	);
	const content = fixture
		.replace('RF61 2026 0043', creditorReference(number))
		.replaceAll('>50.00<', '>120.00<')
		.replaceAll('ZV20261205', `ZV${Date.now()}`);
	await office.goto('/#/finance/payments');
	await office
		.getByLabel('Datei wählen')
		.setInputFiles({ name: 'camt054.xml', mimeType: 'application/xml', buffer: Buffer.from(content) });
	await expect(office.getByText(/camt054\.xml: 3 Gutschriften, 1 verbucht/)).toBeVisible();
	await office.goto(`/#/finance/invoices/${invoiceId}`);
	await expect(office.getByText('Bezahlt', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
	await expect(office.getByText(/^Geöffnet am /)).toBeVisible();
});
