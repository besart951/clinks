import { expect, test, type Locator } from '@playwright/test';
import { failOnCspViolations } from './csp-guard.ts';
import { signIn } from './helpers.ts';

// Phones and touch screens: layout, navigation and target sizes.
failOnCspViolations();

test('finds the way around the calendar on a phone', async ({ page }) => {
	await signIn(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/#/calendar');
	// Day view by default, the date in the middle, the week to pick a day from.
	const views = page.getByRole('group', { name: 'Ansicht' });
	await expect(views.getByRole('button', { name: 'Tag' })).toHaveAttribute('aria-pressed', 'true');
	const week = page.getByRole('group', { name: 'Woche' });
	await expect(week.getByRole('button')).toHaveCount(7);
	const tomorrow = week.locator('[aria-pressed="true"] + button');
	const name = await tomorrow.getAttribute('aria-label');
	await tomorrow.click();
	await expect(week.getByRole('button', { name: name! })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Heute', exact: true })).toBeVisible();
	await expect(page.getByRole('term').filter({ hasText: 'Geplante Zeit' })).toBeVisible();
	// Nothing scrolls sideways, and a new appointment is a thumb away.
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.getByRole('button', { name: 'Neuer Termin' }).click();
	await expect(page.getByRole('dialog', { name: 'Neuer Termin' })).toBeVisible();
	await page.keyboard.press('Escape');
	await views.getByRole('button', { name: 'Woche' }).click();
	await expect(page).toHaveURL(/view=week/);
	await expect(week).toHaveCount(0);
});

test('keeps side sheets inside a phone screen without sideways scrolling', async ({ page }) => {
	await signIn(page);
	await page.setViewportSize({ width: 390, height: 800 });
	/** Elements of the open sheet that scroll sideways. */
	const sideways = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('[data-slot="sheet-content"]')].flatMap((sheet) =>
				[sheet, ...sheet.querySelectorAll('*')]
					.filter(
						(element) =>
							element.scrollWidth > element.clientWidth + 1 &&
							['auto', 'scroll'].includes(getComputedStyle(element).overflowX),
					)
					.map((element) => element.className),
			),
		);
	await page.goto('/#/calendar?view=day');
	await page.getByRole('grid').first().getByRole('button').first().dblclick();
	const sheet = page.getByRole('dialog', { name: 'Termin bearbeiten' });
	await expect(sheet.getByLabel('Titel')).toBeVisible();
	expect(Math.round((await sheet.boundingBox())?.width ?? 0)).toBe(390);
	expect(await sideways()).toEqual([]);
	// The footer is reached by scrolling down, not sideways.
	await sheet.getByRole('button', { name: 'Speichern' }).scrollIntoViewIfNeeded();
	await expect(sheet.getByRole('button', { name: 'Speichern' })).toBeInViewport({ ratio: 1 });
	await page.goto('/#/contacts?new=1');
	await expect(page.getByLabel('Vorname')).toBeVisible();
	expect(await sideways()).toEqual([]);
});

test('fits every page into a phone screen, with touch-sized targets', async ({ browser }) => {
	test.setTimeout(300_000);
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await context.newPage();
	const tooWide: string[] = [];
	const check = async (path: string) => {
		await page.goto(`/#${path}`);
		await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
		// Some pages settle with a redirect (e.g. to their first tab); measure once that is done.
		await page.waitForLoadState('networkidle');
		await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth).catch(() => -1)).not.toBe(-1);
		const width = await page.evaluate(() => document.documentElement.scrollWidth);
		if (width > 390) tooWide.push(`${path}: ${width}px`);
	};
	/** The first link on a page that leads to a record, e.g. a contact. */
	const firstRecord = async (path: string, pattern: RegExp) => {
		await page.goto(`/#${path}`);
		await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
		let link: string | undefined;
		await expect
			.poll(async () => {
				link = await page
					.evaluate(
						(source) =>
							[...document.querySelectorAll('a[href]')]
								.map((a) => a.getAttribute('href')!)
								.find((value) => new RegExp(source).test(value)),
						pattern.source,
					)
					.catch(() => undefined);
				return link;
			})
			.toBeTruthy();
		return link ? link.slice(link.indexOf('#') + 1).split('?')[0] : null;
	};

	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	for (const path of ['/login', '/signup', '/forgot-password']) await check(path);

	await signIn(page);
	const details = [
		await firstRecord('/contacts', /\/contacts\/[0-9a-f-]{36}/),
		await firstRecord('/physio', /\/physio\/[0-9a-f-]{36}/),
		await firstRecord('/dashboard', /\/planner\/[0-9a-f-]{36}/),
		await firstRecord('/mail/campaigns', /\/campaigns\/[0-9a-f-]{36}/),
		await firstRecord('/finance', /\/finance\/invoices\/[0-9a-f-]{36}/),
		await firstRecord('/calendar?view=resources', /\/team\/[0-9a-f-]{36}/),
	];
	for (const path of [
		'/dashboard',
		'/contacts',
		'/calendar',
		'/calendar?view=week',
		'/calendar?view=month',
		'/planner',
		'/mail',
		'/mail/campaigns',
		'/mail/templates',
		'/documents',
		'/physio',
		'/finance',
		'/finance/payments',
		'/finance/expenses',
		'/finance/reports',
		'/finance/invoices/new',
		'/activity',
		'/notifications',
		'/help',
		'/settings',
		'/settings/profile',
		'/settings/team',
		'/settings/roles',
		'/settings/billing',
		'/settings/privacy',
		'/settings/storage',
		'/settings/mail',
		'/onboarding',
		...(details as string[]),
	])
		await check(path);

	await page.goto('/#/dashboard');
	await page.getByRole('button', { name: 'Mehr' }).click();
	await page.getByRole('button', { name: 'Arbeitsbereich' }).click();
	await page.getByRole('menuitem', { name: 'Stille Spitex Seeland' }).click();
	const client = await firstRecord('/spitex/clients', /\/spitex\/clients\/[0-9a-f-]{36}/);
	for (const path of ['/spitex', '/spitex/clients', '/spitex/clients?view=cards', '/spitex/time', '/visits', client!])
		await check(path);
	expect(tooWide).toEqual([]);
	await context.close();
});

test('gives fingers big enough targets on a touch screen', async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await context.newPage();
	await signIn(page);
	await page.goto('/#/finance/expenses');
	await page.getByRole('button', { name: 'Neue Ausgabe' }).click();
	const sheet = page.getByRole('dialog', { name: 'Neue Ausgabe' });
	for (const target of [sheet.getByLabel('Beschreibung'), sheet.getByRole('button', { name: 'Speichern' })])
		expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(40);
	// The receipt is picked with our own button, not the browser's «Choose File» field.
	await expect(sheet.getByRole('button', { name: 'Beleg wählen' })).toBeVisible();
	// Bigger buttons must still fit: the mail footer with three of them stays inside the screen.
	await page.goto('/#/mail');
	await page.getByRole('button', { name: 'Neue Mail' }).click();
	const send = page.getByRole('button', { name: 'Senden' });
	await expect(send).toBeInViewport({ ratio: 1 });
	await context.close();
});

test('marks an appointment with a tap and opens it with a second tap', async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await context.newPage();
	await signIn(page);
	await page.goto('/#/calendar?view=day');
	const appointment = page.getByRole('grid').first().getByRole('button').first();
	const sheet = page.getByRole('dialog', { name: 'Termin bearbeiten' });
	await appointment.tap();
	await expect(appointment).toHaveAttribute('aria-current', 'true');
	await expect(sheet).toBeHidden();
	await appointment.tap();
	await expect(sheet.getByLabel('Titel')).toBeVisible();
	await context.close();
});

test('shows one board column at a time on a phone', async ({ page }) => {
	await signIn(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/#/planner');
	const columns = page.getByRole('group', { name: 'Spalten' });
	await expect(columns.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
	await columns.getByRole('button', { name: /^In Arbeit/ }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'In Arbeit' })).toBeInViewport();
	await expect(columns.getByRole('button', { name: /^In Arbeit/ })).toHaveAttribute('aria-pressed', 'true');
	// The calendar is a list by day: seven narrow columns would not fit the titles.
	await page.getByRole('tab', { name: 'Kalender' }).click();
	await expect(page.locator('section[aria-labelledby^="due-"]').first()).toBeVisible();
});

test('swipes a mail to archive it and picks several with a long press', async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await context.newPage();
	await signIn(page);
	await page.goto('/#/mail');
	const rows = page.getByRole('list', { name: 'Posteingang' }).getByRole('listitem');
	await expect(rows.first()).toBeVisible();
	const count = await rows.count();
	const touch = async (row: Locator, type: string, x: number, y: number) =>
		row.dispatchEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: x, clientY: y });
	// Swiping left far enough archives the mail.
	const box = (await rows.first().boundingBox())!;
	const y = box.y + box.height / 2;
	await touch(rows.first(), 'pointerdown', box.x + box.width - 20, y);
	for (const step of [30, 80, 160, 240]) await touch(rows.first(), 'pointermove', box.x + box.width - 20 - step, y);
	await touch(rows.first(), 'pointerup', box.x + 20, y);
	await expect(page.getByText('Verschoben nach Archiv')).toBeVisible();
	await expect(rows).toHaveCount(count - 1);
	// A long press starts picking; a tap then adds another mail instead of opening it.
	const first = (await rows.first().boundingBox())!;
	await touch(rows.first(), 'pointerdown', first.x + 40, first.y + 10);
	await page.waitForTimeout(650);
	await touch(rows.first(), 'pointerup', first.x + 40, first.y + 10);
	const bar = page.getByRole('region', { name: 'Auswahl' });
	await expect(bar).toContainText('1 ausgewählt');
	await rows.nth(1).getByRole('button').first().tap();
	await expect(bar).toContainText('2 ausgewählt');
	await context.close();
});
