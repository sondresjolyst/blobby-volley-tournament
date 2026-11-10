import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

const auth = () => ({ authorization: `Bearer ${process.env.E2E_GAME_SERVER_TOKEN ?? ''}` });

async function signUp(browser: Browser, nickname: string) {
    const player = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const page = await player.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    await player.close();
}

interface Sync {
    syncVersion: string;
    players: { playerId: number; nickname: string; code: string }[];
    matches: { matchId: number; state: string; nextGame: number; scoreToWin: number; speed: number; nextGameDelay: number; wins1: number; wins2: number; players: { playerId: number; code: string }[] }[];
}

async function readSync(request: APIRequestContext): Promise<Sync> {
    const res = await request.get('/api/server/sync', { headers: auth() });
    expect(res.status()).toBe(200);
    return res.json();
}

test('the game server API needs its token and does not use the admin login', async ({ page }) => {
    // The page has an admin session cookie, which must not be enough.
    for (const [method, path] of [
        ['get', '/api/server/sync'],
        ['post', '/api/server/games'],
        ['post', '/api/server/live'],
        ['post', '/api/server/matches/1/connected'],
    ] as const) {
        const res = await page.request[method](path, { headers: { authorization: 'Bearer e2e-placeholder-wrong' }, data: method === 'post' ? {} : undefined, maxRedirects: 0 });
        expect(res.status()).toBe(401);
        expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    const bad = await page.request.post('/api/server/games', { headers: auth(), data: { reportId: 'nope' } });
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid', field: 'reportId' });
});

test('the game server page shows how long ago the game server reported, and follows it without a reload', async ({ page }) => {
    await readSync(page.request);
    const answer = await page.request.get('/api/admin/game-server/health');
    expect(answer.headers()['cache-control']).toContain('no-store');
    expect((await answer.json()).ageSeconds).toBeLessThan(60);

    await page.goto('/admin/game-server');
    const line = page.locator('.admin-health');
    await expect(line).toHaveText(/^Last report: \d+ s ago$/);
    await expect(line).toHaveAttribute('data-ok', 'true');

    // The page asks again on its own. An old report shows red, and no report shows never.
    await page.route('**/api/admin/game-server/health', (route) => route.fulfill({ json: { ageSeconds: 75 } }));
    await expect(line).toHaveText(/^Last report: (7[5-9]|8\d) s ago$/, { timeout: 10_000 });
    await expect(line).toHaveAttribute('data-ok', 'false');
    await page.unroute('**/api/admin/game-server/health');
    await page.route('**/api/admin/game-server/health', (route) => route.fulfill({ json: { ageSeconds: null } }));
    await expect(line).toHaveText('Last report: never', { timeout: 10_000 });
    await expect(line).toHaveAttribute('data-ok', 'false');

    // A failed check says so instead of counting on.
    await page.unroute('**/api/admin/game-server/health');
    await page.route('**/api/admin/game-server/health', (route) => route.fulfill({ status: 500, json: { error: 'x' } }));
    await expect(line).toHaveText('Health check failed. Trying again.', { timeout: 10_000 });
    await page.unroute('**/api/admin/game-server/health');
    await page.route('**/api/admin/game-server/health', (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
    await expect(line).toHaveText('Health check failed because you are signed out. Sign in again.', { timeout: 10_000 });
    await page.unroute('**/api/admin/game-server/health');
    await expect(line).toHaveText(/^Last report: \d+ s ago$/, { timeout: 10_000 });
    await expect(line).toHaveAttribute('data-ok', 'true');
});

test('the game server syncs a called match, starts it, sends a live score and reports a game', async ({ page, browser, request }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Ga${tag}`, `Gb${tag}`];
    for (const nickname of nicknames) await signUp(browser, nickname);

    await page.goto('/admin/tournaments/new');
    const name = `Server cup ${tag}`;
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Points to win a game').fill('21');
    await page.getByLabel('Game speed in frames per second').fill('90');
    for (const nickname of nicknames) await page.getByRole('checkbox', { name: nickname }).check();
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByLabel(/^Best of for /).selectOption('1');
    await page.getByRole('button', { name: 'Save tournament' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    // The pause between games starts at 10 seconds and is set on the tournament page.
    await expect(page.getByLabel('Pause between games in seconds')).toHaveValue('10');
    await page.getByLabel('Pause between games in seconds').fill('30');
    await page.getByRole('button', { name: 'Save pause' }).click();
    // The form posts in the background, and the notice can be there from the last save.
    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Saved the tournament.');
    await expect(page.getByLabel('Pause between games in seconds')).toHaveValue('30');

    await page.goto(`/admin/matches?q=${encodeURIComponent(name)}`);
    const row = page.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(name) });
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Call selected matches' }).click();
    await expect(page.getByRole('status')).toHaveText(/^Called match \d+\.$/);

    const sync = await readSync(request);
    const ids = nicknames.map((nickname) => sync.players.find((p) => p.nickname === nickname)!.playerId);
    const codes = nicknames.map((nickname) => sync.players.find((p) => p.nickname === nickname)!.code);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    const match = sync.matches.find((m) => m.players.some((p) => p.playerId === ids[0]))!;
    expect(match).toMatchObject({ state: 'called', nextGame: 1, scoreToWin: 21, speed: 90, nextGameDelay: 30, wins1: 0, wins2: 0 });
    expect(match.players.map((p) => p.code).sort()).toEqual([...codes].sort());

    const connected = await request.post(`/api/server/matches/${match.matchId}/connected`, { headers: auth(), data: { playerIds: ids } });
    expect(await connected.json()).toEqual({ status: 'started' });
    const again = await request.post(`/api/server/matches/${match.matchId}/connected`, { headers: auth(), data: { playerIds: ids } });
    expect(await again.json()).toEqual({ status: 'already-started' });

    const points = (a: number, b: number) => [
        { playerId: ids[0], points: a },
        { playerId: ids[1], points: b },
    ];
    expect(await (await request.post('/api/server/live', { headers: auth(), data: { matchId: match.matchId, game: 1, points: points(7, 4) } })).json()).toEqual({ status: 'stored' });
    // The big screen reads the live score without any login.
    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const live = await (await screen.request.get(`/api/matches/${match.matchId}/live`)).json();
    expect(live).toMatchObject({ matchId: match.matchId, state: 'started', live: { game: 1 } });
    expect(live.live.points.sort((x: { playerId: number }, y: { playerId: number }) => x.playerId - y.playerId)).toEqual(points(7, 4).sort((x, y) => x.playerId - y.playerId));

    const report = { reportId: randomUUID(), matchId: match.matchId, game: 1, status: 'finished', winnerId: ids[1], points: points(18, 21), startedAt: '2026-11-20T18:00:00Z', endedAt: '2026-11-20T18:06:00Z' };
    expect(await (await request.post('/api/server/games', { headers: auth(), data: report })).json()).toEqual({ status: 'stored' });
    expect(await (await request.post('/api/server/games', { headers: auth(), data: report })).json()).toEqual({ status: 'duplicate' });
    expect(await (await screen.request.get(`/api/matches/${match.matchId}/live`)).json()).toMatchObject({ state: 'finished', live: null });
    await screen.close();

    // The best-of-1 match is decided, so it leaves the sync.
    expect((await readSync(request)).matches.some((m) => m.matchId === match.matchId)).toBe(false);
    await page.goto(`/admin/matches/${match.matchId}`);
    await expect(page.getByText('State: Finished')).toBeVisible();
    await expect(page.getByText(`${nicknames[1]} wins`)).toBeVisible();
    await expect(page.getByText('Games to 21 points at 90 frames per second.')).toBeVisible();
});

test('an admin gives a player a new join code', async ({ page, browser, request }) => {
    const nickname = `Jc${randomBytes(3).toString('hex')}`;
    await signUp(browser, nickname);
    const before = (await readSync(request)).players.find((p) => p.nickname === nickname)!.code;

    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    await page.getByLabel('Search by nickname').fill(nickname);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: `New join code for ${nickname}` }).click();
    await expect(page.getByRole('status')).toHaveText(`${nickname} has a new join code. The old join link stops working.`);
    // The admin page does not show codes.
    await expect(page.getByText(before)).toHaveCount(0);

    const after = (await readSync(request)).players.find((p) => p.nickname === nickname)!.code;
    expect(after).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    expect(after).not.toBe(before);
});

test('an abandoned game with the player who left waits for the admin on the admin home page', async ({ page, browser, request }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`La${tag}`, `Lb${tag}`];
    for (const nickname of nicknames) await signUp(browser, nickname);

    await page.goto('/admin/tournaments/new');
    const name = `Left cup ${tag}`;
    await page.getByLabel('Name').fill(name);
    for (const nickname of nicknames) await page.getByRole('checkbox', { name: nickname }).check();
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByLabel(/^Best of for /).selectOption('3');
    await page.getByRole('button', { name: 'Save tournament' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

    await page.goto(`/admin/matches?q=${encodeURIComponent(name)}`);
    const row = page.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(name) });
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Call selected matches' }).click();
    await expect(page.getByRole('status')).toHaveText(/^Called match \d+\.$/);

    const sync = await readSync(request);
    const ids = nicknames.map((nickname) => sync.players.find((p) => p.nickname === nickname)!.playerId);
    const match = sync.matches.find((m) => m.players.some((p) => p.playerId === ids[0]))!;
    // The seeding may put either player first. The page names them and their points in match order.
    const first = match.players[0].playerId === ids[0] ? 0 : 1;
    const [one, two] = first === 0 ? nicknames : [nicknames[1], nicknames[0]];
    const stopped = `Game 1 abandoned at ${first === 0 ? '6-8' : '8-6'}. ${nicknames[0]} left.`;
    const report = (change: Record<string, unknown>) => ({
        reportId: randomUUID(),
        matchId: match.matchId,
        game: 1,
        status: 'abandoned',
        winnerId: null,
        points: [
            { playerId: ids[0], points: 6 },
            { playerId: ids[1], points: 8 },
        ],
        startedAt: '2026-11-20T18:00:00Z',
        endedAt: '2026-11-20T18:03:00Z',
        ...change,
    });
    // A player who is not in the match, or a finished game that names one, is refused.
    expect(await (await request.post('/api/server/games', { headers: auth(), data: report({ leftPlayerId: 2_000_000_000 }) })).json()).toEqual({ status: 'refused', reason: 'players' });
    const finished = await request.post('/api/server/games', { headers: auth(), data: report({ status: 'finished', winnerId: ids[1], leftPlayerId: ids[0] }) });
    expect(finished.status()).toBe(400);
    expect(await finished.json()).toEqual({ error: 'invalid', field: 'leftPlayerId' });
    expect(await (await request.post('/api/server/games', { headers: auth(), data: report({ leftPlayerId: ids[0] }) })).json()).toEqual({ status: 'stored' });

    await page.goto('/admin');
    const waiting = page.getByRole('region', { name: 'Waiting for a decision' }).getByRole('row', { name: new RegExp(name) });
    await expect(waiting).toContainText('E2E LAN');
    await expect(waiting).toContainText(`${one} vs ${two}`);
    await expect(waiting).toContainText(stopped);
    await waiting.getByRole('link', { name: `Open match ${match.matchId}` }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The last game was abandoned.' })).toHaveText(`The last game was abandoned. ${stopped} Select Restart current game, or enter the result under Enter or correct a game result.`);
    await expect(page.getByRole('cell', { name: `Abandoned, ${nicknames[0]} left` })).toBeVisible();

    await page.getByRole('button', { name: 'Restart current game' }).click();
    await expect(page.getByRole('status')).toHaveText('The game restarts from 0-0.');
    await page.goto('/admin');
    await expect(page.getByRole('region', { name: 'Waiting for a decision' }).getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
});
