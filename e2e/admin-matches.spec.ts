import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

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
        await playerPage.getByLabel('Event code').fill(process.env.E2E_EVENT_CODE ?? '');
        await playerPage.getByLabel('Nickname').fill(nickname);
        await playerPage.getByLabel('PIN (4 digits)').fill('1234');
        await playerPage.getByRole('button', { name: 'Sign up' }).click();
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
    await expect(page.getByText('No places decided yet.')).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Matches' }).click();
    const row = page.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(name) });
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Call the picked matches' }).click();
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

    await page.getByRole('link', { name: 'Tournament' }).click();
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
