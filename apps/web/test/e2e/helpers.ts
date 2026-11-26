import { expect, type Locator, type Page } from '@playwright/test';

/** Signs in to the in-browser mock with a demo account, without simulated latency or failures. */
export async function signIn(page: Page, email = 'besi@stille.ch') {
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

export /** Another demo account in the same browser, keeping the demo data as it is. */
async function switchAccount(page: Page, email: string) {
	await page.getByRole('button', { name: 'Kontomenü' }).click();
	await page.getByRole('menuitem', { name: 'Abmelden' }).click();
	await expect(page).toHaveURL(/#\/login/);
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill('demo1234');
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page).toHaveURL(/#\/dashboard/);
}

/** A toast sits over the action row at the bottom right and pauses while hovered: move away until it is gone. */
export async function waitForToastGone(page: Page, text: string) {
	await expect(page.getByText(text)).toBeVisible();
	await page.mouse.move(0, 0);
	await expect(page.getByText(text)).toBeHidden({ timeout: 10_000 });
}

/** Native drag and drop in small steps, like a real mouse; a direct jump does not always start the drag. */
/** Drags with the mouse; `at` is where on the target to let go, as fractions of its size (default: centre). */
export async function dragOnto(page: Page, source: Locator, target: Locator, at = { x: 0.5, y: 0.5 }) {
	const from = (await source.boundingBox())!;
	const to = (await target.boundingBox())!;
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
	await page.mouse.move(to.x + to.width * at.x, to.y + to.height * at.y, { steps: 10 });
	await page.mouse.up();
}
