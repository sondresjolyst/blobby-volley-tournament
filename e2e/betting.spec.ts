import { randomBytes } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';

async function signUp(browser: Browser, nickname: string) {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const page = await context.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    return { context, page };
}

test('a signed out visitor cannot place a bet, while a signed in player can', async ({ browser, baseURL }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Ba${tag}`, `Bb${tag}`];
    for (const nickname of nicknames) await (await signUp(browser, nickname)).context.close();

    // An admin saves a tournament for the two players, which opens its match for bets.
    const admin = await browser.newContext({ baseURL });
    await admin.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/tournaments/new');
    const name = `Bet cup ${tag}`;
    await adminPage.getByLabel('Name').fill(name);
    for (const nickname of nicknames) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name })).toBeVisible();
    await adminPage.goto(`/admin/matches?q=${encodeURIComponent(name)}`);
    const href = await adminPage.getByRole('link', { name: new RegExp(name) }).getAttribute('href');
    const matchId = href!.match(/\/admin\/matches\/(\d+)/)![1];
    await admin.close();

    // A signed in player bets through the form on /me.
    const bettor = await signUp(browser, `Bc${tag}`);
    const form = bettor.page.locator(`#kamp-${matchId}`).getByRole('group', { name: /^Sats på / });
    await form.getByRole('radio', { name: new RegExp(`^${nicknames[0]} `) }).check();
    await form.getByLabel('Kor mykje Foza tør du?').fill('100');
    await form.getByRole('button', { name: 'Sats' }).click();
    await expect(bettor.page.getByRole('status')).toHaveText('Spelet ditt e lagt inn. Lykke te!');
    await expect(bettor.page.getByRole('navigation', { name: 'Spelarsidå' })).toContainText('900 Foza');
    await expect(bettor.page.locator(`#kamp-${matchId}`)).toContainText('Du har satsa 100 Foza på');
    await bettor.context.close();

    const before = await (await browser.newContext({ baseURL })).request.get(`/api/matches/${matchId}/pool`);
    expect(before.status()).toBe(200);
    const pool = await before.json();
    expect(pool).toMatchObject({ open: true, total: 100 });

    // A visitor with no session is sent to sign-in, and the pool does not change.
    const visitor = await browser.newContext({ baseURL });
    const res = await visitor.request.post('/api/player/bets', {
        form: { matchId, on: String(pool.sides[1].playerId), amount: '50' },
        headers: { 'sec-fetch-site': 'same-origin' },
        maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers()['location']).toBe('/login');
    const balance = await visitor.request.get('/api/player/balance', { maxRedirects: 0 });
    expect(balance.status()).toBe(401);
    const bets = await visitor.request.get('/api/player/bets', { maxRedirects: 0 });
    expect(bets.status()).toBe(401);
    const after = await (await visitor.request.get(`/api/matches/${matchId}/pool`)).json();
    expect(after).toEqual(pool);
    await visitor.close();
});
