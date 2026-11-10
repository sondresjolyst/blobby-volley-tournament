import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const eventCode = process.env.E2E_EVENT_CODE ?? '';

/** A nickname no other test uses. 'Spiller' and 6 hex characters is 13 bytes. */
const uniqueNickname = () => `Spiller${randomBytes(3).toString('hex')}`;

async function signUp(page: Page, nickname: string, pin: string) {
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(eventCode.toLowerCase());
    await page.getByLabel('Kallenavn', { exact: true }).fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill(pin);
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
}

test('a player signs up with the event code and sees the starting Foza', async ({ page, context }) => {
    const nickname = uniqueNickname();
    await signUp(page, nickname, '1234');
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: nickname })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Spelarsidå' })).toContainText(/1\s000 Foza/);

    const cookie = (await context.cookies()).find((c) => c.name === 'bvt_player');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.secure).toBe(true);
    expect(cookie!.expires * 1000 - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);

    // The device is remembered.
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: nickname })).toBeVisible();

    // The front page header signs out too, and the player lands on the front page signed out.
    await page.goto('/');
    const menu = page.getByRole('navigation', { name: 'Hovudmeny' });
    await menu.getByRole('button', { name: 'Logg ut' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(menu.getByRole('link', { name: 'Logg inn' })).toBeVisible();
    await expect(menu).not.toContainText(nickname);
    await page.goto('/me');
    await expect(page).toHaveURL(/\/login$/);

    // The old cookie no longer works, since its session is gone.
    await context.addCookies([cookie!]);
    await page.goto('/me');
    await expect(page).toHaveURL(/\/login$/);
});

test('sign-up refuses a wrong event code', async ({ page }) => {
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill('WRONG-CODE');
    await page.getByLabel('Kallenavn', { exact: true }).fill(uniqueNickname());
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/join\?error=code$/);
    await expect(page.getByRole('alert').filter({ hasText: 'Den LAN-koden stemme ikkje.' })).toBeVisible();
});

test('sign-in with a wrong PIN is refused and the right PIN works', async ({ page, context }) => {
    const nickname = uniqueNickname();
    await signUp(page, nickname, '1234');
    await expect(page).toHaveURL(/\/me$/);
    await page.getByRole('button', { name: 'Logg ut' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/login');

    await page.getByLabel('Kallenavn', { exact: true }).fill(nickname.toUpperCase());
    await page.getByLabel('PIN-kode', { exact: true }).fill('9999');
    await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?error=wrong$/);
    await expect(page.getByRole('alert').filter({ hasText: 'Feil kallenavn eller PIN-kode.' })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'bvt_player')).toBeUndefined();

    await page.getByLabel('Kallenavn', { exact: true }).fill(nickname);
    await page.getByLabel('PIN-kode', { exact: true }).fill('1234');
    await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: nickname })).toBeVisible();
});

test('the player page sends a visitor without a session to sign-in', async ({ page }) => {
    await page.goto('/me');
    await expect(page).toHaveURL(/\/login$/);
});
