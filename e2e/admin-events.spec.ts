import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Chromium stores a Secure cookie for http://localhost, so the admin session can be a real cookie.
// A header would not be sent again after the redirect that follows a form post.
test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

// These tests never change which event is active, so the player tests can run at the same time.

test('an admin creates and edits an event', async ({ page }) => {
    const name = `Test LAN ${randomBytes(3).toString('hex')}`;
    await page.goto('/admin/events/new');
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Start date').fill('2027-11-19');
    await page.getByLabel('End date').fill('2027-11-21');
    await page.getByLabel('Event code').fill('lan-2027');
    await page.getByLabel('Starting Foza').fill('2000');
    await page.getByLabel('Daily Foza').fill('200');
    await page.getByRole('button', { name: 'Create event' }).click();

    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect(page.getByLabel('Event code')).toHaveValue('LAN-2027');
    await expect(page.getByText('This event is not active.')).toBeVisible();

    await page.getByLabel('Daily Foza').fill('250');
    await page.getByLabel('Game server host').fill('LAN-PC.local');
    await page.getByLabel('Game server port').fill('1234');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel('Daily Foza')).toHaveValue('250');
    await expect(page.getByLabel('Game server host')).toHaveValue('lan-pc.local');
    await expect(page.getByLabel('Game server port')).toHaveValue('1234');

    await page.getByLabel('Game server port').fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Give both a game server host' })).toBeVisible();

    await page.goto('/admin/events');
    await expect(page.getByRole('link', { name })).toBeVisible();
});

test('an admin resets the PIN of a player', async ({ page, browser }) => {
    const nickname = `Pin${randomBytes(3).toString('hex')}`;
    const player = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const playerPage = await player.newPage();
    await playerPage.goto('/join');
    await playerPage.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await playerPage.getByLabel('Kallenavn').fill(nickname);
    await playerPage.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await playerPage.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(playerPage).toHaveURL(/\/me$/);

    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    const row = page.getByRole('row', { name: new RegExp(nickname) });
    await expect(row).toContainText('1000');
    await row.getByLabel(`New PIN for ${nickname}`).fill('5678');
    await row.getByRole('button', { name: 'Reset PIN' }).click();
    await expect(page.getByRole('status')).toHaveText(`The PIN for ${nickname} is reset.`);

    // The reset signs the player out on every device.
    await playerPage.goto('/me');
    await expect(playerPage).toHaveURL(/\/login$/);
    await playerPage.getByLabel('Kallenavn').fill(nickname);
    await playerPage.getByLabel('PIN-kode', { exact: true }).fill('5678');
    await playerPage.getByRole('button', { name: 'Logg inn', exact: true }).click();
    await expect(playerPage).toHaveURL(/\/me$/);
    await player.close();
});
