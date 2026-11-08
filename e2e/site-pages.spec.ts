import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Set SITE_SHOTS to a folder to save screenshots of the front page, /join, /login and /admin there.
const shots = process.env.SITE_SHOTS;
const eventCode = process.env.E2E_EVENT_CODE ?? '';

async function asAdmin(context: BrowserContext, baseURL: string | undefined) {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
}

/** True when the page is wider than the window, so the visitor would have to scroll sideways. */
const scrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** The elements that reach past the right edge of the window, to explain a failure. */
const tooWide = (page: Page) =>
    page.evaluate(() =>
        [...document.querySelectorAll('body *')]
            .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
            .join(', '),
    );

test('the html of the site is Norwegian', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'nn');
});

test('the front page shows the active event and the way in for a visitor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'E2E LAN' })).toBeVisible();
    await expect(page.getByText('20. til 22. november 2026')).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'Bli med på LANet' })).toHaveAttribute('href', '/join');
    await expect(main.getByRole('link', { name: 'Logg inn' })).toHaveAttribute('href', '/login');
    await expect(main.getByRole('link', { name: /^Kampoppsett/ })).toHaveAttribute('href', '/bracket');
    await expect(main.getByRole('link', { name: /^Toppliste/ })).toHaveAttribute('href', '/leaderboard');
    // The big screen link never carries a key.
    await expect(main.getByRole('link', { name: /^Storskjermen/ })).toHaveAttribute('href', '/big');
    await expect(page.getByRole('heading', { level: 2, name: 'I ringen no' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Snart i ringen' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('href', '/admin');
});

test('the front page links a signed in player to their page', async ({ page }) => {
    const nickname = `Forside${randomBytes(3).toString('hex')}`;
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(eventCode);
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);

    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Hovudmeny' }).getByRole('link', { name: new RegExp(nickname) })).toHaveAttribute('href', '/me');
    await expect(page.getByRole('link', { name: 'Gå te sidå di' })).toHaveAttribute('href', '/me');
    await expect(page.getByRole('link', { name: 'Bli med på LANet' })).toHaveCount(0);
});

test('sign-up has labelled fields with hints and keeps the PIN rules', async ({ page }) => {
    await page.goto('/join');
    await expect(page.getByRole('heading', { level: 1, name: 'E2E LAN' })).toBeVisible();
    // The hint, then the help behind the i button.
    await expect(page.getByLabel('LAN-kode')).toHaveAccessibleDescription(/^Står på storskjermen, eller spør ein admin. Koden står på storskjermen i lokalet/);
    await expect(page.getByLabel('Kallenavn')).toHaveAttribute('maxlength', '15');
    const pin = page.getByLabel('PIN-kode (4 siffer)');
    await expect(pin).toHaveAttribute('type', 'password');
    await expect(pin).toHaveAttribute('pattern', '[0-9]{4}');
    await expect(page.getByRole('link', { name: 'Logg inn' })).toHaveAttribute('href', '/login');
});

test('the one sign-in page has the player form and the admin GitHub button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Kallenavn')).toBeVisible();
    await expect(page.getByLabel('PIN-kode', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logg inn', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Admin? Logg inn med GitHub' })).toBeVisible();
    await expect(page.getByText('Den sidå e bare for admin.')).toHaveCount(0);

    await page.goto('/admin/matches');
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin%2Fmatches$/);
    await expect(page.getByText('Den sidå e bare for admin. Logg inn med GitHub.')).toBeVisible();
});

test('the old admin sign-in address is gone', async ({ request }) => {
    expect((await request.get('/signin')).status()).toBe(404);
});

test('an unknown error code shows nothing and a known one is announced in dialect', async ({ page }) => {
    await page.goto('/login?error=nope');
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await page.goto('/join?error=pin');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('PIN-koden må vera 4 siffer.');
});

test('the admin pages share the menu', async ({ page, context, baseURL }) => {
    await asAdmin(context, baseURL);
    await page.goto('/admin');
    const menu = page.getByRole('navigation', { name: 'Admin' });
    await expect(menu.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Events', 'Tournaments', 'Matches', 'Game server', 'Big screen']) await expect(menu.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await menu.getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Events', exact: true })).toHaveAttribute('aria-current', 'page');
});

for (const [width, height] of [
    [1440, 900],
    [390, 844],
]) {
    test(`the public and admin pages fit a ${width} px window`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL, viewport: { width, height } });
        await asAdmin(context, baseURL);
        const page = await context.newPage();
        for (const [path, name] of [
            ['/', 'home'],
            ['/join', 'join'],
            ['/login', 'login'],
            ['/admin', 'admin'],
            ['/admin/events', 'admin-events'],
            ['/admin/events/1', 'admin-event'],
            ['/admin/matches', 'admin-matches'],
        ]) {
            await page.goto(path);
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            expect(await scrollsSideways(page), `${path} scrolls sideways at ${width} px: ${await tooWide(page)}`).toBe(false);
            if (shots) await page.screenshot({ path: join(shots, `${name}-${width}.png`), fullPage: true });
        }
        await context.close();
    });
}
