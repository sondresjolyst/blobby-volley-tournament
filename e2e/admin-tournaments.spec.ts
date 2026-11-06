import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

test('an admin previews and saves a double elimination tournament', async ({ page, browser }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Ta${tag}`, `Tb${tag}`, `Tc${tag}`];
    for (const nickname of nicknames) {
        const player = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
        const playerPage = await player.newPage();
        await playerPage.goto('/join');
        await playerPage.getByLabel('Event code').fill(process.env.E2E_EVENT_CODE ?? '');
        await playerPage.getByLabel('Nickname').fill(nickname);
        await playerPage.getByLabel('PIN (4 digits)').fill('1234');
        await playerPage.getByRole('button', { name: 'Sign up' }).click();
        await expect(playerPage).toHaveURL(/\/me$/);
        await player.close();
    }

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Tournaments' }).click();
    await page.getByRole('link', { name: 'New tournament' }).click();
    const name = `Cup ${tag}`;
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Format').selectOption('double_elimination');
    await page.getByLabel('Seeding').selectOption('manual');
    for (const [i, nickname] of nicknames.entries()) {
        await page.getByRole('checkbox', { name: nickname }).check();
        await page.getByLabel(`Seed for ${nickname}`).fill(String(3 - i));
    }
    await page.getByRole('button', { name: 'Preview' }).click();

    // Hand seeding puts the third player first, so that player gets the bye.
    await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveText([nicknames[2], nicknames[1], nicknames[0]]);
    const firstRound = page.getByRole('region', { name: 'Winners round 1' });
    await expect(firstRound.getByRole('row', { name: /Match 1/ })).toContainText(`${nicknames[1]}${nicknames[0]}`);

    await page.getByLabel('Best of for Grand final').selectOption('5');
    await page.getByLabel('Rules for Grand final').fill('final.lua');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByRole('heading', { name: 'Grand final, best of 5, rules final.lua' })).toBeVisible();

    await page.getByRole('button', { name: 'Save tournament' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect(page.getByText('Format: Double elimination')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Grand final, best of 5, rules final.lua' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Winners round 2' }).getByRole('row', { name: /Match 2/ })).toContainText(`${nicknames[2]}Winner of match 1`);

    await page.getByRole('link', { name: 'Tournaments' }).click();
    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('Double elimination');
});

test('a save with a bad rule file goes back to the form with the error and the values', async ({ page }) => {
    const res = await page.request.post('/api/admin/tournaments', {
        data: new URLSearchParams([
            ['name', 'Bad'],
            ['format', 'single_elimination'],
            ['seeding', 'random'],
            ['randomSeed', '5'],
            ['player', '1'],
            ['player', '2'],
            ['rules_winners-1', '../x.lua'],
        ]).toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
        maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    const location = res.headers()['location'];
    const query = new URLSearchParams(location.split('?')[1]);
    expect(query.get('error')).toBe('rules');
    expect(query.getAll('player')).toEqual(['1', '2']);
    await page.goto(location);
    await expect(page.getByText('A rule file must be a file name')).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue('Bad');
});

test('an admin adds a third place match and must preview again after the players change', async ({ page, browser }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Ua${tag}`, `Ub${tag}`, `Uc${tag}`, `Ud${tag}`, `Ue${tag}`];
    for (const nickname of nicknames) {
        const player = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
        const playerPage = await player.newPage();
        await playerPage.goto('/join');
        await playerPage.getByLabel('Event code').fill(process.env.E2E_EVENT_CODE ?? '');
        await playerPage.getByLabel('Nickname').fill(nickname);
        await playerPage.getByLabel('PIN (4 digits)').fill('1234');
        await playerPage.getByRole('button', { name: 'Sign up' }).click();
        await expect(playerPage).toHaveURL(/\/me$/);
        await player.close();
    }

    await page.goto('/admin/tournaments/new');
    const name = `Bronze ${tag}`;
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Third place match').check();
    for (const nickname of nicknames.slice(0, 4)) await page.getByRole('checkbox', { name: nickname }).check();
    await page.getByRole('button', { name: 'Preview' }).click();
    const third = page.getByRole('region', { name: 'Third place match' });
    await expect(third.getByRole('row', { name: /Match 4/ })).toContainText('Loser of match 1Loser of match 23rd place4th place');

    // A fifth player changes the bracket, so the round settings shown are no longer for it.
    await page.getByRole('checkbox', { name: nicknames[4] }).check();
    await page.getByRole('button', { name: 'Save tournament' }).click();
    await expect(page.getByText('The players or the format changed after the preview.')).toBeVisible();

    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByRole('button', { name: 'Save tournament' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText('Third place match: Yes')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Third place match' })).toBeVisible();
});
