import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('a finished match shows on the leaderboards and the player stats', async ({ browser, baseURL }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`La${tag}`, `Lb${tag}`];
    for (const nickname of nicknames) {
        const player = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
        const page = await player.newPage();
        await page.goto('/join');
        await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
        await page.getByLabel('Kallenavn', { exact: true }).fill(nickname);
        await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
        await page.getByRole('button', { name: 'Bli med på LANet' }).click();
        await expect(page).toHaveURL(/\/me$/);
        await player.close();
    }

    const admin = await browser.newContext({ baseURL });
    await admin.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/tournaments/new');
    const name = `Topp cup ${tag}`;
    await adminPage.getByLabel('Name').fill(name);
    await adminPage.getByLabel('Seeding').selectOption({ label: 'By Elo rating' });
    for (const nickname of nicknames) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name })).toBeVisible();
    await adminPage.goto(`/admin/matches?q=${encodeURIComponent(name)}`);
    await adminPage.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(name) }).getByRole('checkbox').check();
    await adminPage.getByRole('button', { name: 'Call selected matches' }).click();
    await adminPage.getByRole('region', { name: 'Called' }).getByRole('link', { name: new RegExp(name) }).click();
    await adminPage.getByLabel('Result').selectOption({ label: `${nicknames[1]} won` });
    await adminPage.getByLabel(`Points for ${nicknames[0]}`).fill('6');
    await adminPage.getByLabel(`Points for ${nicknames[1]}`).fill('15');
    await adminPage.getByRole('button', { name: 'Save game' }).click();
    await expect(adminPage.getByRole('status')).toHaveText('The game result is saved.');
    await admin.close();

    const visitor = await browser.newContext({ baseURL });
    const page = await visitor.newPage();
    await page.goto('/leaderboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Toppliste' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Velg turnering' }).getByRole('link', { name }).click();
    // Wait for the tournament page, so the board links below belong to it.
    await expect(page).toHaveURL(/[?&]tournament=\d+/);
    await page.getByRole('navigation', { name: 'Toppliste for' }).getByRole('link', { name: 'Seira' }).click();
    await expect(page).toHaveURL(/[?&]board=sigra/);
    const board = page.getByRole('region', { name: 'Toppliste Seira' }).getByRole('listitem');
    await expect(board.first()).toContainText(nicknames[1]);
    await expect(board.first()).toContainText('1 vunne · 0 tapt · 100 %');
    await expect(page.getByRole('region', { name: 'Pallen' }).getByRole('listitem')).toHaveText([`1. plass: ${nicknames[1]}`, `2. plass: ${nicknames[0]}`]);

    await page.getByRole('navigation', { name: 'Toppliste for' }).getByRole('link', { name: 'Elo' }).click();
    const elo = page.getByRole('region', { name: 'Toppliste Elo' }).getByRole('listitem');
    await expect(elo.first()).toContainText(nicknames[1]);
    await expect(elo.first()).toContainText('+16 i denne turneringå');
    await expect(elo.first()).toContainText('1016');

    await elo.first().getByRole('link', { name: nicknames[1] }).click();
    await expect(page.getByRole('heading', { level: 1, name: nicknames[1] })).toBeVisible();
    await expect(page.getByText('+16 på dette LANet')).toBeVisible();
    const h2h = page.getByRole('region', { name: 'Mot kvar motstandar' }).getByRole('row', { name: new RegExp(nicknames[0]) });
    await expect(h2h.getByRole('cell')).toHaveText([nicknames[0], '1', '0']);
    await expect(page.getByRole('region', { name: 'Plasseringa' })).toContainText(`1. plass i ${name}`);
    await visitor.close();
});
