import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

test('an admin calls a tournament match, enters the result and sees the placings', async ({ page, browser }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Ma${tag}`, `Mb${tag}`];
    for (const nickname of nicknames) {
        const player = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
        const playerPage = await player.newPage();
        await playerPage.goto('/join');
        await playerPage.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
        await playerPage.getByLabel('Kallenavn').fill(nickname);
        await playerPage.getByLabel('PIN-kode (4 siffer)').fill('1234');
        await playerPage.getByRole('button', { name: 'Bli med på LANet' }).click();
        await expect(playerPage).toHaveURL(/\/me$/);
        await player.close();
    }

    await page.goto('/admin/tournaments/new');
    const name = `Match cup ${tag}`;
    await page.getByLabel('Name').fill(name);
    for (const nickname of nicknames) await page.getByRole('checkbox', { name: nickname }).check();
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByRole('button', { name: 'Save tournament' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText('No placings yet.')).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Matches' }).click();
    // The list has 10 matches a page, so the search finds the match of this test.
    await page.getByLabel('Search by match, tournament or player').fill(name);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const row = page.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(name) });
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Call selected matches' }).click();
    await expect(page.getByRole('status')).toHaveText(/^Called match \d+\.$/);
    await page.getByRole('region', { name: 'Called' }).getByRole('link', { name: new RegExp(name) }).click();

    await expect(page.getByRole('heading', { level: 1, name: /^Match \d+$/ })).toBeVisible();
    await expect(page.getByText('State: Called')).toBeVisible();
    await page.getByLabel('Result').selectOption({ label: `${nicknames[1]} won` });
    await page.getByLabel(`Points for ${nicknames[0]}`).fill('6');
    await page.getByLabel(`Points for ${nicknames[1]}`).fill('15');
    await page.getByRole('button', { name: 'Save game' }).click();
    await expect(page.getByRole('status')).toHaveText('The game result is saved.');
    await expect(page.getByText('State: Finished')).toBeVisible();
    await expect(page.getByText(`${nicknames[1]} wins`)).toBeVisible();

    await page.getByRole('link', { name: 'Tournament', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Placings' }).getByRole('listitem')).toHaveText([`1. ${nicknames[1]}`, `2. ${nicknames[0]}`]);
});

test('the match route answers 404 for an unknown match and sends a bad form back', async ({ page }) => {
    const res = await page.request.post('/api/admin/matches/2147483647', {
        form: { action: 'cancel' },
        headers: { 'sec-fetch-site': 'same-origin' },
        maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
    const bad = await page.request.post('/api/admin/matches/1', { form: { action: 'nope' }, headers: { 'sec-fetch-site': 'same-origin' }, maxRedirects: 0 });
    expect(bad.status()).toBe(303);
    expect(bad.headers()['location']).toBe('/admin/matches/1?error=form');
});

async function signUp(browser: Browser, nickname: string) {
    const player = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const playerPage = await player.newPage();
    await playerPage.goto('/join');
    await playerPage.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await playerPage.getByLabel('Kallenavn').fill(nickname);
    await playerPage.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await playerPage.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(playerPage).toHaveURL(/\/me$/);
    await player.close();
}

async function openMatch(page: Page, title: string) {
    await page.goto(`/admin/matches?q=${encodeURIComponent(title)}`);
    await page.getByRole('link', { name: new RegExp(`${title}$`) }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^Match \d+$/ })).toBeVisible();
}

/** Enters game 1 on the open match page. Slot 1 or 2 wins 15-3. */
async function enterGame(page: Page, winner: 1 | 2) {
    await page.getByLabel('Game number').fill('1');
    await page.getByLabel('Result').selectOption({ index: winner - 1 });
    await page.getByLabel(/^Points for/).nth(0).fill(winner === 1 ? '15' : '3');
    await page.getByLabel(/^Points for/).nth(1).fill(winner === 1 ? '3' : '15');
    await page.getByRole('button', { name: 'Save game' }).click();
}

test('a correction blocked by a called later match links to it, and works after a reset', async ({ page, browser }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Ra${tag}`, `Rb${tag}`, `Rc${tag}`, `Rd${tag}`];
    for (const nickname of nicknames) await signUp(browser, nickname);

    await page.goto('/admin/tournaments/new');
    const name = `Reset cup ${tag}`;
    await page.getByLabel('Name').fill(name);
    for (const nickname of nicknames) await page.getByRole('checkbox', { name: nickname }).check();
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByRole('button', { name: 'Save tournament' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

    for (const position of [1, 2]) {
        await openMatch(page, `${name}, Round 1, match ${position}`);
        await expect(page.getByRole('button', { name: 'Cancel match' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Call match' }).click();
        await enterGame(page, 1);
        await expect(page.getByText('State: Finished')).toBeVisible();
    }
    await openMatch(page, `${name}, Final, match 1`);
    await page.getByRole('button', { name: 'Call match' }).click();
    await expect(page.getByText('State: Called')).toBeVisible();
    const finalUrl = page.url().split('?')[0];

    await openMatch(page, `${name}, Round 1, match 1`);
    await enterGame(page, 2);
    const alert = page.getByRole('alert').filter({ hasText: 'Reset that match to upcoming first.' });
    await expect(alert).toContainText('Reset that match to upcoming first.');
    await alert.getByRole('link').click();
    await expect(page).toHaveURL(finalUrl);
    await page.getByRole('button', { name: 'Reset to upcoming' }).click();
    await expect(page.getByRole('status')).toHaveText('The match is back to upcoming. Its games are cleared and its bets are refunded.');
    await expect(page.getByText('State: Upcoming')).toBeVisible();

    await openMatch(page, `${name}, Round 1, match 1`);
    await enterGame(page, 2);
    await expect(page.getByRole('status')).toHaveText('The game result is saved.');
    await expect(page.getByText('Series: 0-1')).toBeVisible();
});

test('an admin pages through each match section and stays on the page after calling a match', async ({ page, request }) => {
    const tag = randomBytes(2).toString('hex');
    // Two cups of 8 players have 7 matches each. The search finds both, so Upcoming has 14 matches,
    // and the first match of the second cup that can be called is on page 2.
    const cups = ['A', 'B'].map((cup) => ({ name: `Page cup ${tag} ${cup}`, nicknames: Array.from({ length: 8 }, (_, i) => `Pc${tag}${cup}${i}`) }));
    for (const cup of cups) {
        for (const nickname of cup.nicknames) {
            const res = await request.post('/api/player/signup', {
                form: { code: process.env.E2E_EVENT_CODE ?? '', nickname, pin: '1234' },
                headers: { 'sec-fetch-site': 'same-origin', 'x-e2e-client': '192.0.2.31' },
                maxRedirects: 0,
            });
            expect(res.status(), nickname).toBe(303);
        }
        await page.goto('/admin/tournaments/new');
        await page.getByLabel('Name').fill(cup.name);
        for (const nickname of cup.nicknames) await page.getByRole('checkbox', { name: nickname }).check();
        await page.getByRole('button', { name: 'Preview' }).click();
        await page.getByRole('button', { name: 'Save tournament' }).click();
        await expect(page.getByRole('heading', { level: 1, name: cup.name })).toBeVisible();
    }

    await page.goto('/admin/matches');
    await page.getByLabel('Search by match, tournament or player').fill(`Page cup ${tag}`);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const upcoming = page.getByRole('region', { name: 'Upcoming' });
    const pager = page.getByRole('navigation', { name: 'Pages of upcoming matches' });
    await expect(upcoming.getByRole('heading', { level: 2 })).toHaveText('Upcoming (14)');
    await expect(upcoming.getByRole('row')).toHaveCount(11);
    await expect(pager).toContainText('1 to 10 of 14 matches');
    // A section that fits on one page has no page links.
    await expect(page.getByRole('navigation', { name: 'Pages of called matches' })).toHaveCount(0);

    await pager.getByRole('link', { name: 'Page 2' }).click();
    await expect(page).toHaveURL(/\?upcoming=2&q=Page\+cup\+[0-9a-f]{4}#upcoming$/);
    await expect(pager).toContainText('11 to 14 of 14 matches');
    const row = upcoming.getByRole('row', { name: new RegExp(`${cups[1].name}, Round 1, match 4`) });
    await row.getByRole('checkbox').check();
    await upcoming.getByRole('button', { name: 'Call selected matches' }).click();
    await expect(page.getByRole('status')).toHaveText(/^Called match \d+\.$/);
    // The page and the search stay, and the called match moved to its section.
    await expect(page).toHaveURL(/\?upcoming=2&q=Page\+cup\+[0-9a-f]{4}&called=\d+$/);
    await expect(upcoming.getByRole('heading', { level: 2 })).toHaveText('Upcoming (13)');
    await expect(pager).toContainText('11 to 13 of 13 matches');
    await expect(page.getByRole('region', { name: 'Called' }).getByRole('link', { name: new RegExp(`${cups[1].name}, Round 1, match 4$`) })).toBeVisible();

    // A reload keeps the page.
    await page.reload();
    await expect(pager.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
});
