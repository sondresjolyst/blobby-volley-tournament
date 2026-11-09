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
        await playerPage.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
        await playerPage.getByLabel('Kallenavn').fill(nickname);
        await playerPage.getByLabel('PIN-kode (4 siffer)').fill('1234');
        await playerPage.getByRole('button', { name: 'Bli med på LANet' }).click();
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
    await expect(page.getByRole('main').getByRole('listitem')).toHaveText([nicknames[2], nicknames[1], nicknames[0]]);
    const firstRound = page.getByRole('region', { name: 'Winners round 1' });
    await expect(firstRound.getByRole('row', { name: /Match 1/ })).toContainText(`${nicknames[1]}${nicknames[0]}`);

    await page.getByLabel('Best of for Grand final').selectOption('5');
    // The rules are picked from the game's list, and the real points to win show per round.
    await expect(page.getByLabel('Rules for Grand final').locator('option')).toHaveText(['Vanlig', 'Klassisk', 'Lyn', 'Eitt slag', 'Dobbel', 'Tennis', 'Hoppetusse', 'Limfot', 'Bakforsvar', 'Brannmur']);
    await expect(page.getByLabel('Rules for Grand final')).toHaveValue('default.lua');
    await page.getByLabel('Rules for Grand final').selectOption({ label: 'Tennis' });
    await page.getByLabel('Rules for Winners round 1').selectOption({ label: 'Lyn' });
    await page.getByLabel('Rules for Winners round 2').selectOption({ label: 'Brannmur' });
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByRole('heading', { name: 'Grand final, best of 5, rules Tennis' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Winners round 1/ }).first()).toContainText('2 (always 2 with these rules)');
    await expect(page.getByRole('row', { name: /Winners round 2/ }).first()).toContainText('150 (10 times 15 with these rules)');
    await page.getByRole('button', { name: 'What the rules do' }).click();
    await expect(page.getByText('Tennis (tennis.lua): Eitt touch på kvar side')).toBeVisible();
    if (process.env.SITE_SHOTS) await page.getByRole('group', { name: 'Rounds' }).screenshot({ path: `${process.env.SITE_SHOTS}/rules-tournament-rounds.png` });

    await page.getByRole('button', { name: 'Save tournament' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Saved the tournament.');
    await expect(page.getByText('Format: Double elimination')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Grand final, best of 5, rules Tennis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Winners round 1, best of 1, rules Lyn' })).toBeVisible();
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
    await expect(page.getByText('Pick the rules of each round from the list.')).toBeVisible();

    // A file name the game does not ship is refused too.
    const unknown = await page.request.post('/api/admin/tournaments', {
        data: new URLSearchParams([
            ['name', 'Bad'],
            ['format', 'single_elimination'],
            ['seeding', 'random'],
            ['randomSeed', '5'],
            ['player', '1'],
            ['player', '2'],
            ['rules_final-1', 'fast_ball.lua'],
        ]).toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
        maxRedirects: 0,
    });
    expect(new URLSearchParams(unknown.headers()['location'].split('?')[1]).get('error')).toBe('rules');
    await expect(page.getByLabel('Name')).toHaveValue('Bad');
});

test('an admin adds a third place match and must preview again after the players change', async ({ page, browser }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Ua${tag}`, `Ub${tag}`, `Uc${tag}`, `Ud${tag}`, `Ue${tag}`];
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
