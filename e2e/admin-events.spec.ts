import { randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Chromium stores a Secure cookie for http://localhost, so the admin session can be a real cookie.
// A header would not be sent again after the redirect that follows a form post.
test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

// These tests never change which event is active, so the player tests can run at the same time.

/** Searches the player list of the open event page, which shows 10 players a page. */
async function searchPlayers(page: Page, nickname: string) {
    await page.getByLabel('Search by nickname').fill(nickname);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('row', { name: new RegExp(nickname) })).toBeVisible();
}

/** Signs up players straight through the sign-up route, from a made-up network with its own limit. */
async function signUpMany(request: APIRequestContext, nicknames: string[], network: string) {
    for (const nickname of nicknames) {
        const res = await request.post('/api/player/signup', {
            form: { code: process.env.E2E_EVENT_CODE ?? '', nickname, pin: '1234' },
            headers: { 'sec-fetch-site': 'same-origin', 'x-e2e-client': network },
            maxRedirects: 0,
        });
        expect(res.status(), nickname).toBe(303);
    }
}

test('an admin creates an event with a generated code and edits it', async ({ page }) => {
    const tag = randomBytes(3).toString('hex');
    const name = `Test LAN ${tag}`;
    await page.goto('/admin/events/new');
    // The code follows the name until the admin presses Generate.
    await page.getByLabel('Name').fill(name);
    // The name is public, so the suggestion always ends with random characters.
    await expect(page.getByLabel('Event code')).toHaveValue(new RegExp(`^TEST-LAN-${tag.toUpperCase()}-[A-HJKMNP-Z2-9]{4}$`));
    const suggested = await page.getByLabel('Event code').inputValue();
    await page.getByLabel('Name').fill(`${name} 2`);
    await expect(page.getByLabel('Event code')).toHaveValue(`TEST-LAN-${tag.toUpperCase()}-2-${suggested.slice(-4)}`);
    await page.getByRole('button', { name: 'Generate' }).click();
    const code = await page.getByLabel('Event code').inputValue();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    await page.getByLabel('Name').fill(`${name} B`);
    await expect(page.getByLabel('Event code')).toHaveValue(code);
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Start date').fill('2027-11-19');
    await page.getByLabel('End date').fill('2027-11-21');
    await page.getByLabel('Starting Foza').fill('2000');
    await page.getByLabel('Daily Foza').fill('200');

    // The i button opens the help for the host and closes with Escape.
    const info = page.getByRole('button', { name: 'Where to find the host' });
    await expect(info).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('ipconfig on Windows')).toBeHidden();
    await info.click();
    await expect(info).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('ipconfig on Windows')).toBeVisible();
    await expect(page.getByText('Leave the port empty to use 1234')).toBeVisible();
    await info.press('Escape');
    await expect(page.getByText('ipconfig on Windows')).toBeHidden();

    await page.getByRole('button', { name: 'Create event' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Saved the event.');
    await expect(page.getByLabel('Event code')).toHaveValue(code);
    await expect(page.getByText('This event is not active.')).toBeVisible();

    // A typed code is stored in upper case.
    await page.getByLabel('Event code').fill(`lan-${tag}`);
    await page.getByLabel('Daily Foza').fill('250');
    await page.getByLabel('Game server host').fill('LAN-PC.local');
    await page.getByLabel('Game server port').fill('1240');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByLabel('Event code')).toHaveValue(`LAN-${tag.toUpperCase()}`);
    await expect(page.getByLabel('Daily Foza')).toHaveValue('250');
    await expect(page.getByLabel('Game server host')).toHaveValue('lan-pc.local');
    await expect(page.getByLabel('Game server port')).toHaveValue('1240');

    // An empty port is the default port.
    await page.getByLabel('Game server port').fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Saved the event.');
    await expect(page.getByLabel('Game server port')).toHaveValue('1234');

    for (const host of ['localhost', '127.0.0.1', 'http://192.168.1.50', '999.1.1.1']) {
        await page.getByLabel('Game server host').fill(host);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'It cannot be localhost, 127.0.0.1 or a web address' })).toBeVisible();
    }
    await expect(page.getByLabel('Game server host')).toHaveValue('lan-pc.local');

    // Two events cannot share a code.
    await page.getByLabel('Event code').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Another event already has this event code.' })).toBeVisible();
    await expect(page.getByLabel('Event code')).toHaveValue(`LAN-${tag.toUpperCase()}`);

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
    await searchPlayers(page, nickname);
    const row = page.getByRole('row', { name: new RegExp(nickname) });
    await expect(row).toContainText('1000');
    await row.getByLabel(`New PIN for ${nickname}`).fill('5678');
    await row.getByRole('button', { name: 'Reset PIN' }).click();
    await expect(page.getByRole('status')).toHaveText(`Reset the PIN for ${nickname}.`);

    // The reset signs the player out on every device.
    await playerPage.goto('/me');
    await expect(playerPage).toHaveURL(/\/login$/);
    await playerPage.getByLabel('Kallenavn').fill(nickname);
    await playerPage.getByLabel('PIN-kode', { exact: true }).fill('5678');
    await playerPage.getByRole('button', { name: 'Logg inn', exact: true }).click();
    await expect(playerPage).toHaveURL(/\/me$/);
    await player.close();
});

test('an admin sees the wrong PINs of a player and unlocks a locked player', async ({ page, browser }) => {
    // The prefix keeps the nickname from ever reading Locked.
    const nickname = `Wp${randomBytes(3).toString('hex')}`;
    const player = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const playerPage = await player.newPage();
    await playerPage.goto('/join');
    await playerPage.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await playerPage.getByLabel('Kallenavn').fill(nickname);
    await playerPage.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await playerPage.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(playerPage).toHaveURL(/\/me$/);
    await playerPage.getByRole('button', { name: 'Logg ut' }).click();
    const signIn = async (pin: string) => {
        await playerPage.goto('/login');
        await playerPage.getByLabel('Kallenavn').fill(nickname);
        await playerPage.getByLabel('PIN-kode', { exact: true }).fill(pin);
        await playerPage.getByRole('button', { name: 'Logg inn', exact: true }).click();
    };

    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    await searchPlayers(page, nickname);
    const row = page.getByRole('row', { name: new RegExp(nickname) });
    await expect(row).toBeVisible();
    // Without the #players of the search, so a goto loads the page again.
    const eventPage = page.url().split('#')[0];
    // Without wrong PINs there is nothing to unlock.
    await expect(row.getByRole('button', { name: `Unlock ${nickname}` })).toHaveCount(0);

    for (let i = 0; i < 2; i++) await signIn('0000');
    await page.goto(eventPage);
    await expect(row).toContainText('2 of 5 wrong PINs');
    for (let i = 0; i < 3; i++) await signIn('0000');
    await expect(playerPage).toHaveURL(/\/login\?error=locked$/);
    await page.goto(eventPage);
    await expect(row).toContainText(/Locked until \d+ \w+ \d{4}, \d{2}:\d{2}:\d{2}/);

    await row.getByRole('button', { name: `Unlock ${nickname}` }).click();
    await expect(page.getByRole('status')).toHaveText(`${nickname} is unlocked and can sign in again.`);
    await expect(row.getByRole('button', { name: `Unlock ${nickname}` })).toHaveCount(0);
    await expect(row).not.toContainText(/Locked until/);

    await signIn('1234');
    await expect(playerPage).toHaveURL(/\/me$/);
    await player.close();

    await page.getByRole('button', { name: 'Reset network PIN limit' }).click();
    await expect(page.getByRole('status')).toHaveText('Reset the network PIN limit. Every network can try PINs again.');
    await expect(page.getByText(/The busiest network has \d+ of 40 wrong PINs this hour\./)).toBeVisible();
});

test('an admin pages through the players, searches them and stays on the page after an action', async ({ page, request }) => {
    const tag = randomBytes(3).toString('hex');
    const nicknames = Array.from({ length: 12 }, (_, i) => `Pg${tag}${String(i).padStart(2, '0')}`);
    await signUpMany(request, nicknames, '192.0.2.30');

    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    const players = page.getByRole('region', { name: 'Players', exact: true });
    const pager = page.getByRole('navigation', { name: 'Pages of players' });
    // Without a search the list shows the first 10 players of the event.
    await expect(players.getByRole('row')).toHaveCount(11);
    await expect(pager).toContainText(/^1 to 10 of \d+ players/);

    // The search finds nicknames in any case, 10 a page.
    const search = `pg${tag.toUpperCase()}`;
    await players.getByLabel('Search by nickname').fill(search);
    await players.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`\\?q=${search}#players$`));
    await expect(pager).toContainText('1 to 10 of 12 players');
    await expect(players.getByRole('row', { name: new RegExp(nicknames[0]) })).toBeVisible();
    await expect(players.getByRole('row', { name: new RegExp(nicknames[11]) })).toHaveCount(0);

    await pager.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(new RegExp(`\\?players=2&q=${search}#players$`));
    await expect(pager).toContainText('11 to 12 of 12 players');
    await expect(pager.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

    // An action on page 2 comes back to page 2 with the same search.
    const row = players.getByRole('row', { name: new RegExp(nicknames[11]) });
    await row.getByLabel(`Foza change for ${nicknames[11]}, such as 50 or -50`).fill('-50');
    await row.getByLabel(`Reason for ${nicknames[11]}`).fill('Paging test');
    await row.getByRole('button', { name: 'Adjust Foza' }).click();
    await expect(page.getByRole('status')).toHaveText(`The Foza of ${nicknames[11]} is now 950.`);
    await expect(page).toHaveURL(new RegExp(`\\?players=2&q=${search}&adjusted=\\d+$`));
    await expect(pager).toContainText('11 to 12 of 12 players');
    await expect(row).toContainText('950');

    // A reload keeps the page and the search.
    await page.reload();
    await expect(pager).toContainText('11 to 12 of 12 players');
    await expect(players.getByLabel('Search by nickname')).toHaveValue(search);

    await pager.getByRole('link', { name: 'Previous' }).click();
    await expect(pager).toContainText('1 to 10 of 12 players');
    await expect(page).toHaveURL(new RegExp(`\\?q=${search}#players$`));
    await players.getByRole('link', { name: 'Show all players' }).click();
    await expect(players.getByLabel('Search by nickname')).toHaveValue('');
});
