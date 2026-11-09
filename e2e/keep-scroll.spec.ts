import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

// A form post keeps the page where the reader was, and the result floats into view.

const adminCookie = (baseURL: string) => ({
    name: '__Secure-next-auth.session-token',
    value: process.env.E2E_ADMIN_TOKEN ?? '',
    domain: new URL(baseURL).hostname,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax' as const,
});

// These sign-ups come from their own made-up network, so they do not use up the limit the other tests share.
const network = { 'x-e2e-client': '192.0.2.30' };

async function signUp(browser: Browser, nickname: string) {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 390, height: 600 }, extraHTTPHeaders: network });
    const page = await context.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    return { context, page };
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

/** Where the element is on the screen, from the top. */
const screenTop = async (el: Locator) => (await el.boundingBox())!.y;

/**
 * Presses the button. The check it returns tells that the page did not move under `anchor`, and
 * that the scroll stayed within `scrollSlack` pixels.
 */
async function pressInPlace(page: Page, button: Locator, anchor: Locator, scrollSlack = 150) {
    const scroll = await scrollY(page);
    expect(scroll).toBeGreaterThan(200);
    const top = await screenTop(anchor);
    await button.click();
    return async () => {
        expect(Math.abs((await screenTop(anchor)) - top)).toBeLessThan(150);
        expect(Math.abs((await scrollY(page)) - scroll)).toBeLessThan(scrollSlack);
    };
}

// Other tests add matches to the same event while this one runs, and a match above the card moves
// it down the page. The page then scrolls with the card, so the scroll may change by that much.
const OTHER_MATCHES = 1500;

test('placing a bet keeps the scroll and shows the result on the screen', async ({ browser, baseURL }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Sa${tag}`, `Sb${tag}`];
    for (const nickname of nicknames) await (await signUp(browser, nickname)).context.close();

    const admin = await browser.newContext({ baseURL });
    await admin.addCookies([adminCookie(baseURL!)]);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/tournaments/new');
    const name = `Scroll cup ${tag}`;
    await adminPage.getByLabel('Name').fill(name);
    for (const nickname of nicknames) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name })).toBeVisible();
    await adminPage.goto(`/admin/matches?q=${encodeURIComponent(name)}`);
    const href = await adminPage.getByRole('link', { name: new RegExp(name) }).getAttribute('href');
    const matchId = href!.match(/\/admin\/matches\/(\d+)/)![1];
    await admin.close();

    const { context, page } = await signUp(browser, `Sc${tag}`);
    const card = page.locator(`#kamp-${matchId}`);
    const form = card.getByRole('group', { name: /^Sats på / });
    await form.getByRole('radio', { name: new RegExp(`^${nicknames[0]} `) }).check();
    await form.getByLabel('Kor mykje Foza tør du?').fill('10');
    const button = form.getByRole('button', { name: 'Sats' });
    await button.scrollIntoViewIfNeeded();
    const checkPlace = await pressInPlace(page, button, form, OTHER_MATCHES);
    await expect(card).toContainText('Du har satsa 10 Foza på');
    // The notice sits at the top of the page, so it floats at the bottom of the screen.
    const notice = page.getByRole('status');
    await expect(notice).toHaveText('Spelet ditt e lagt inn. Lykke te!');
    await expect(notice).toBeInViewport();
    await checkPlace();
    // The field is empty again, as after a page load.
    await expect(form.getByLabel('Kor mykje Foza tør du?')).toHaveValue('');

    // The notice closes when it is pressed. A second bet on the same address shows its result again.
    await notice.click();
    await expect(notice).toBeHidden();
    await form.getByLabel('Kor mykje Foza tør du?').fill('5');
    const raise = form.getByRole('button', { name: 'Høgn spelet' });
    const checkRaise = await pressInPlace(page, raise, form, OTHER_MATCHES);
    await expect(card).toContainText('Du har satsa 15 Foza på');
    await expect(page.getByRole('status')).toBeInViewport();
    await checkRaise();
    await context.close();
});

test('saving the game server settings of an event keeps the scroll, also on a page without JavaScript', async ({ browser, baseURL }) => {
    const tag = randomBytes(3).toString('hex');
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 500 } });
    await context.addCookies([adminCookie(baseURL!)]);
    const page = await context.newPage();
    await page.goto('/admin/events/new');
    await page.getByLabel('Name').fill(`Scroll LAN ${tag}`);
    await page.getByLabel('Start date').fill('2027-11-19');
    await page.getByLabel('End date').fill('2027-11-21');
    await page.getByLabel('Starting Foza').fill('1000');
    await page.getByLabel('Daily Foza').fill('100');
    await page.getByRole('button', { name: 'Create event' }).click();
    await expect(page).toHaveURL(/\/admin\/events\/\d+\?saved=1$/);
    const eventUrl = page.url().split('?')[0];

    const save = page.getByRole('button', { name: 'Save', exact: true });
    await page.getByLabel('Game server host').fill('192.168.1.60');
    await page.getByLabel('Game server port').fill('1300');
    await save.scrollIntoViewIfNeeded();
    const checkSave = await pressInPlace(page, save, save);
    // The address had saved=1 already, so the page loads its data again and the notice floats.
    const notice = page.getByRole('status');
    await expect(notice).toHaveText('Saved the event.');
    await expect(notice).toBeInViewport();
    await expect(page.getByLabel('Game server port')).toHaveValue('1300');
    await checkSave();

    // A wrong host shows its error on the screen too, and the page stays.
    await page.getByLabel('Game server host').fill('http://example.com');
    await save.scrollIntoViewIfNeeded();
    const checkError = await pressInPlace(page, save, save);
    await expect(page).toHaveURL(/\?error=server-host$/);
    const alert = page.getByRole('alert').filter({ hasText: 'The game server host must be the LAN address' });
    await expect(alert).toBeInViewport();
    await checkError();
    await context.close();

    // Without JavaScript the form posts and loads the page as before.
    const plain = await browser.newContext({ baseURL, javaScriptEnabled: false });
    await plain.addCookies([adminCookie(baseURL!)]);
    const plainPage = await plain.newPage();
    await plainPage.goto(eventUrl);
    await plainPage.getByLabel('Game server port').fill('1301');
    await plainPage.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(plainPage).toHaveURL(/\?saved=1$/);
    await expect(plainPage.getByLabel('Game server port')).toHaveValue('1301');
    await plain.close();
});

test('a post that fails shows an error once and is not sent again', async ({ browser }) => {
    const { context, page } = await signUp(browser, `Sf${randomBytes(2).toString('hex')}`);
    let posts = 0;
    await page.route('**/api/player/signout', (route) => {
        posts += 1;
        return route.fulfill({ status: 500, body: 'Internal Server Error' });
    });
    await page.getByRole('button', { name: 'Logg ut' }).first().click();
    const alert = page.getByRole('alert').filter({ hasText: 'Noko gjekk gale' });
    await expect(alert).toBeInViewport();
    await expect(page).toHaveURL(/\/me$/);
    expect(posts).toBe(1);
    await page.keyboard.press('Escape');
    await expect(alert).toBeHidden();

    // The sign-out still works when the route answers, and its cookie is kept.
    await page.unroute('**/api/player/signout');
    await page.getByRole('button', { name: 'Logg ut' }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/me');
    await expect(page).not.toHaveURL(/\/me$/);
    await context.close();
});
