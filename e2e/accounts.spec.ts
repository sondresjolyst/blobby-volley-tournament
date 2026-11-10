import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// This spec makes a second LAN active, so it runs after every other spec. See playwright.config.ts.

// The players of this spec sign up from their own network, so the sign-up limit of the shared one does not matter.
const network = { 'x-e2e-client': '192.0.2.50' };

async function asAdmin(browser: Browser, baseURL: string): Promise<BrowserContext> {
    const admin = await browser.newContext({ baseURL, extraHTTPHeaders: network });
    await admin.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    return admin;
}

async function signUp(page: Page, code: string, nickname: string, pin: string) {
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(code);
    await page.getByLabel('Kallenavn', { exact: true }).fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill(pin);
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
}

test('an account keeps its nickname, PIN and Elo at the next LAN, and can change its nickname', async ({ browser, baseURL }) => {
    const tag = randomBytes(2).toString('hex');
    const winner = `Konto${tag}`;
    const loser = `Taper${tag}`;

    // LAN 1: two players sign up, and the first wins a rated match.
    for (const nickname of [winner, loser]) {
        const context = await browser.newContext({ baseURL, extraHTTPHeaders: network });
        const page = await context.newPage();
        await signUp(page, process.env.E2E_EVENT_CODE ?? '', nickname, '4321');
        await expect(page).toHaveURL(/\/me$/);
        await context.close();
    }
    const admin = await asAdmin(browser, baseURL!);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/tournaments/new');
    const cup = `Konto cup ${tag}`;
    await adminPage.getByLabel('Name').fill(cup);
    for (const nickname of [winner, loser]) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name: cup })).toBeVisible();
    await adminPage.goto(`/admin/matches?q=${encodeURIComponent(cup)}`);
    await adminPage.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(cup) }).getByRole('checkbox').check();
    await adminPage.getByRole('button', { name: 'Call selected matches' }).click();
    await adminPage.getByRole('region', { name: 'Called' }).getByRole('link', { name: new RegExp(cup) }).click();
    await adminPage.getByLabel('Result').selectOption({ label: `${winner} won` });
    await adminPage.getByLabel(`Points for ${winner}`).fill('15');
    await adminPage.getByLabel(`Points for ${loser}`).fill('6');
    await adminPage.getByRole('button', { name: 'Save game' }).click();
    await expect(adminPage.getByRole('status')).toHaveText('The game result is saved.');
    await adminPage.goto('/admin/events');
    const lan1Link = adminPage.getByRole('link', { name: 'E2E LAN', exact: true });
    const lan1 = (await lan1Link.getAttribute('href'))!.split('/').pop();

    // LAN 2 opens.
    const lan2Code = `LAN2-${tag.toUpperCase()}`;
    await adminPage.goto('/admin/events/new');
    await adminPage.getByLabel('Name').fill(`LAN 2 ${tag}`);
    await adminPage.getByLabel('Event code').fill(lan2Code);
    await adminPage.getByLabel('Start date').fill('2027-11-19');
    await adminPage.getByLabel('End date').fill('2027-11-21');
    await adminPage.getByLabel('Starting Foza').fill('700');
    await adminPage.getByLabel('Daily Foza').fill('0');
    await adminPage.getByRole('button', { name: 'Create event' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name: `LAN 2 ${tag}` })).toBeVisible();
    await adminPage.getByRole('button', { name: 'Set active' }).click();
    await expect(adminPage).toHaveURL(/\/admin\/events$/);

    // The winner signs in with the same nickname and PIN and joins LAN 2 with its code.
    const player = await browser.newContext({ baseURL, extraHTTPHeaders: network });
    const page = await player.newPage();
    await page.goto('/login');
    await page.getByLabel('Kallenavn', { exact: true }).fill(winner.toLowerCase());
    await page.getByLabel('PIN-kode', { exact: true }).fill('4321');
    await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
    await expect(page).toHaveURL(/\/bli-med$/);
    await expect(page.getByRole('heading', { name: `Bli med på LAN 2 ${tag}` })).toBeVisible();
    await page.getByLabel('LAN-kode').fill('WRONG-CODE');
    await page.getByRole('button', { name: 'Bli med', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Den LAN-koden stemme ikkje.' })).toBeVisible();
    await page.getByLabel('LAN-kode').fill(lan2Code.toLowerCase());
    await page.getByRole('button', { name: 'Bli med', exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: `Hei, ${winner}!` })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Spelarsidå' })).toContainText(/700 Foza/);

    // The Elo from LAN 1 came along.
    await adminPage.goto('/admin/tournaments/new');
    await expect(adminPage.getByRole('row', { name: new RegExp(winner) }).getByRole('cell').last()).toHaveText('1016');

    // Nobody else can sign up with that nickname at LAN 2.
    const other = await browser.newContext({ baseURL, extraHTTPHeaders: network });
    const otherPage = await other.newPage();
    await signUp(otherPage, lan2Code, winner.toUpperCase(), '1111');
    await expect(otherPage).toHaveURL(/\/join\?error=taken$/);
    await expect(otherPage.getByRole('alert').filter({ hasText: 'Det nicket e allerede tatt.' })).toBeVisible();
    await signUp(otherPage, lan2Code, `Ny${tag}`, '1111');
    await expect(otherPage).toHaveURL(/\/me$/);
    await other.close();

    // A taken nickname is refused on /me, and a free one follows the account everywhere.
    const renamed = `Ny${winner}`;
    const form = page.getByRole('region', { name: 'Bytt kallenavn' });
    await form.getByLabel('Nytt kallenavn').fill(`ny${tag}`);
    await form.getByRole('button', { name: 'Bytt kallenavn' }).click();
    await expect(page.getByRole('region', { name: 'Bytt kallenavn' }).getByRole('alert')).toHaveText('Det nicket e allerede tatt.');
    await page.getByRole('region', { name: 'Bytt kallenavn' }).getByLabel('Nytt kallenavn').fill(renamed);
    await page.getByRole('region', { name: 'Bytt kallenavn' }).getByRole('button', { name: 'Bytt kallenavn' }).click();
    await expect(page.getByRole('region', { name: 'Bytt kallenavn' }).getByRole('status')).toContainText('Kallenavnet ditt e bytta.');
    await expect(page.getByRole('heading', { name: `Hei, ${renamed}!` })).toBeVisible();

    // LAN 1 shows the new nickname.
    await page.goto(`/leaderboard?event=${lan1}&board=elo`);
    const elo = page.getByRole('region', { name: 'Toppliste Elo' });
    await expect(elo.getByRole('link', { name: renamed, exact: true })).toBeVisible();
    await expect(elo.getByRole('link', { name: winner, exact: true })).toHaveCount(0);

    // The new nickname signs in, the old one does not.
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Hovudmeny' }).getByRole('button', { name: 'Logg ut' }).click();
    await page.goto('/login');
    await page.getByLabel('Kallenavn', { exact: true }).fill(winner);
    await page.getByLabel('PIN-kode', { exact: true }).fill('4321');
    await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Feil kallenavn eller PIN-kode.' })).toBeVisible();
    await page.getByLabel('Kallenavn', { exact: true }).fill(renamed);
    await page.getByLabel('PIN-kode', { exact: true }).fill('4321');
    await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);
    await player.close();
    await admin.close();
});
