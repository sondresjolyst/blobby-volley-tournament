import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

// Set SITE_SHOTS to a folder to save screenshots of /elo there.
const shots = process.env.SITE_SHOTS;

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
    await expect(h2h.getByRole('cell')).toHaveText([nicknames[0], '1', '0', 'Sjå kampane']);
    await expect(h2h.getByRole('link', { name: 'Sjå kampane' })).toHaveAttribute('href', /^\/resultat\?spelar=\d+&mot=\d+$/);
    await expect(page.getByRole('region', { name: 'Plasseringa' })).toContainText(`1. plass i ${name}`);
    await visitor.close();
});

test('the info button of the Elo board links to the page that explains Elo', async ({ page }) => {
    await page.goto('/leaderboard?board=elo');
    const board = page.getByRole('region', { name: 'Toppliste Elo' });
    await board.getByRole('button', { name: 'Ka e Elo?' }).click();
    await expect(board.getByText('Lika gode spelara gir 16 poeng.')).toBeVisible();
    await board.getByRole('link', { name: 'Sjå utrekningå' }).click();
    await expect(page).toHaveURL(/\/elo$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sånn funke Elo' })).toBeVisible();
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows.filter({ hasText: 'Lika gode' })).toContainText('+16');
    await expect(rows.filter({ hasText: 'Underdogen vinne, 200 under' })).toContainText('+24');
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        if (shots) await page.screenshot({ path: join(shots, `elo-${width}.png`), fullPage: true });
    }
});

const auth = () => ({ authorization: `Bearer ${process.env.E2E_GAME_SERVER_TOKEN ?? ''}` });
const sameOrigin = { 'sec-fetch-site': 'same-origin' };
// These sign-ups come from their own made-up network, so they do not use up the limit the other tests share.
const network = { 'x-e2e-client': '192.0.2.51' };

async function signUp(browser: Browser, nickname: string): Promise<BrowserContext> {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, extraHTTPHeaders: network });
    const page = await context.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn', { exact: true }).fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    await page.close();
    return context;
}

type Sync = { players: { playerId: number; nickname: string }[]; matches: { matchId: number; players: { playerId: number }[] }[] };
const sync = async (context: BrowserContext): Promise<Sync> => (await context.request.get('/api/server/sync', { headers: auth() })).json();

const line = (playerId: number, ballSteps: number, touches: number, errors: number, netHits: number) => ({ playerId, ballSteps, touches, errors, netHits });

/** Two new players with a finished 1v1 that has stats. The first player lost the game 8-15 and has 30 touches. */
async function finishedDuel(browser: Browser) {
    const tag = randomBytes(2).toString('hex');
    const names: [string, string] = [`Profil${tag}`, `Motpart${tag}`];
    const [asker, asked] = [await signUp(browser, names[0]), await signUp(browser, names[1])];
    const players = new Map((await sync(asked)).players.map((p) => [p.nickname, p.playerId]));
    const ids: [number, number] = [players.get(names[0])!, players.get(names[1])!];
    await asker.request.post('/api/player/challenges', { form: { opponent: String(ids[1]), bestOf: '1', scoreToWin: '15', speed: '75' }, headers: sameOrigin, maxRedirects: 0 });
    const before = new Set((await sync(asked)).matches.map((m) => m.matchId));
    const page = await asked.newPage();
    await page.goto('/me');
    await page.getByRole('list', { name: 'Utfordringa te deg' }).getByRole('button', { name: 'Godta' }).click();
    await expect(page.getByRole('status')).toHaveText('Du godtok kampen. Dåkke kan spela med ein gang.');
    await page.close();
    const matchId = (await sync(asked)).matches.find((m) => !before.has(m.matchId) && m.players.some((p) => p.playerId === ids[1]))!.matchId;
    await asked.request.post(`/api/server/matches/${matchId}/connected`, { headers: auth(), data: { playerIds: ids } });
    const stats = { players: [line(ids[0], 4000, 30, 2, 1), line(ids[1], 6000, 20, 4, 0)], rallies: 10, longestRally: 8, rallyTouches: 50 };
    const data = {
        reportId: randomUUID(),
        matchId,
        game: 1,
        status: 'finished',
        winnerId: ids[1],
        points: [
            { playerId: ids[0], points: 8 },
            { playerId: ids[1], points: 15 },
        ],
        stats,
        startedAt: '2026-11-20T18:00:00Z',
        endedAt: '2026-11-20T18:05:00Z',
    };
    expect(await (await asker.request.post('/api/server/games', { headers: auth(), data })).json()).toEqual({ status: 'stored' });
    return { matchId, ids, names, contexts: [asker, asked] };
}

test('profile shows match stats by default', async ({ browser }) => {
    const duel = await finishedDuel(browser);
    const page = await duel.contexts[0].newPage();
    await page.goto(`/leaderboard/players/${duel.ids[0]}`);
    const block = page.getByRole('region', { name: 'Statistikk frå spela' });
    await expect(block.getByRole('button', { name: 'Kampa' })).toHaveAttribute('aria-pressed', 'true');
    await expect(block.getByRole('group', { name: 'Ballinnehav' })).toHaveText('Ballinnehav40 %');
    await expect(block.getByRole('group', { name: 'Touch per kamp' })).toHaveText('Touch per kamp30,0');
    await expect(block.getByRole('group', { name: 'Feil per kamp' })).toHaveText('Feil per kamp2,0');
    await expect(block.getByRole('group', { name: 'Nett-treff' })).toHaveText('Nett-treff1');
    await expect(block.getByRole('group', { name: 'Lengste ballveksling' })).toHaveText('Lengste ballveksling8');
    await expect(block.getByRole('group', { name: 'Snitt ballveksling' })).toHaveText('Snitt ballveksling5,0');
    await expect(block.getByRole('group', { name: 'Kampa med statistikk' })).toHaveText('Kampa med statistikk1');
    await Promise.all(duel.contexts.map((c) => c.close()));
});

test('switching to Trening and Alt changes the numbers without a reload', async ({ browser }) => {
    const duel = await finishedDuel(browser);
    const page = await duel.contexts[0].newPage();
    await page.goto(`/leaderboard/players/${duel.ids[0]}`);
    const block = page.getByRole('region', { name: 'Statistikk frå spela' });
    await expect(block.getByRole('group', { name: 'Ballinnehav' })).toBeVisible();
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await block.getByRole('button', { name: 'Trening' }).click();
    await expect(block.getByRole('button', { name: 'Trening' })).toHaveAttribute('aria-pressed', 'true');
    await expect(block.getByText('Ingen treninga med statistikk ennå.')).toBeVisible();
    await expect(block.getByRole('group')).toHaveCount(0);
    await block.getByRole('button', { name: 'Alt' }).click();
    await expect(block.getByRole('group', { name: 'Kampa med statistikk' })).toHaveText('Kampa med statistikk1');
    expect(requests.filter((p) => p.startsWith('/api') || p.startsWith('/leaderboard/players'))).toEqual([]);
    await Promise.all(duel.contexts.map((c) => c.close()));
});

test('siste kampa links to the match page', async ({ browser }) => {
    const duel = await finishedDuel(browser);
    const page = await duel.contexts[0].newPage();
    await page.goto(`/leaderboard/players/${duel.ids[0]}`);
    const recent = page.getByRole('region', { name: 'Siste kampa' });
    const row = recent.getByRole('listitem').first();
    await expect(row).toContainText(`${duel.names[0]} vs ${duel.names[1]}`);
    await expect(row).toContainText('0–1');
    await expect(row).toContainText('1v1');
    await row.getByRole('link', { name: `Sjå kampen: ${duel.names[0]} mot ${duel.names[1]}` }).click();
    await expect(page).toHaveURL(new RegExp(`/kamp/${duel.matchId}$`));
    await Promise.all(duel.contexts.map((c) => c.close()));
});

test('profile without stats shows no stats block', async ({ browser }) => {
    const nickname = `Ny${randomBytes(2).toString('hex')}`;
    const context = await signUp(browser, nickname);
    const id = (await sync(context)).players.find((p) => p.nickname === nickname)!.playerId;
    const page = await context.newPage();
    await page.goto(`/leaderboard/players/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: nickname })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Statistikk frå spela' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Trening' })).toHaveCount(0);
    await context.close();
});
