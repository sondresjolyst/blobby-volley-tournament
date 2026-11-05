import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const eventCode = process.env.E2E_EVENT_CODE ?? '';

/** A nickname no other test uses. 'Spiller' and 6 hex characters is 13 bytes. */
const uniqueNickname = () => `Spiller${randomBytes(3).toString('hex')}`;

async function signUp(page: Page, nickname: string, pin: string) {
    await page.goto('/join');
    await page.getByLabel('Event code').fill(eventCode.toLowerCase());
    await page.getByLabel('Nickname').fill(nickname);
    await page.getByLabel('PIN (4 digits)').fill(pin);
    await page.getByRole('button', { name: 'Sign up' }).click();
}

test('a player signs up with the event code and sees the starting Foza', async ({ page, context }) => {
    const nickname = uniqueNickname();
    await signUp(page, nickname, '1234');
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: nickname })).toBeVisible();
    await expect(page.getByText('Foza: 1000')).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === 'bvt_player');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.secure).toBe(true);
    expect(cookie!.expires * 1000 - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);

    // The device is remembered.
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: nickname })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/me');
    await expect(page).toHaveURL(/\/login$/);
});

test('sign-up refuses a wrong event code', async ({ page }) => {
    await page.goto('/join');
    await page.getByLabel('Event code').fill('WRONG-CODE');
    await page.getByLabel('Nickname').fill(uniqueNickname());
    await page.getByLabel('PIN (4 digits)').fill('1234');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/join\?error=code$/);
    await expect(page.getByRole('alert').filter({ hasText: 'The event code is wrong.' })).toBeVisible();
});

test('sign-in with a wrong PIN is refused and the right PIN works', async ({ page, context }) => {
    const nickname = uniqueNickname();
    await signUp(page, nickname, '1234');
    await expect(page).toHaveURL(/\/me$/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Nickname').fill(nickname.toUpperCase());
    await page.getByLabel('PIN').fill('9999');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login\?error=wrong$/);
    await expect(page.getByRole('alert').filter({ hasText: 'Wrong nickname or PIN.' })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'bvt_player')).toBeUndefined();

    await page.getByLabel('Nickname').fill(nickname);
    await page.getByLabel('PIN').fill('1234');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: nickname })).toBeVisible();
});

test('the player page sends a visitor without a session to sign-in', async ({ page }) => {
    await page.goto('/me');
    await expect(page).toHaveURL(/\/login$/);
});
