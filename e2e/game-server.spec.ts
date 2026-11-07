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
    await page.getByLabel('Event code').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Nickname').fill(nickname);
    await page.getByLabel('PIN (4 digits)').fill('1234');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/me$/);
    await player.close();
}

interface Sync {
    syncVersion: string;
    players: { playerId: number; nickname: string; code: string }[];
    matches: { matchId: number; state: string; nextGame: number; scoreToWin: number; speed: number; wins1: number; wins2: number; players: { playerId: number; code: string }[] }[];
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

    await page.goto('/admin/matches');
    const row = page.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(name) });
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Call the picked matches' }).click();
    await expect(page.getByRole('status')).toHaveText(/^Called match \d+\.$/);

    const sync = await readSync(request);
    const ids = nicknames.map((nickname) => sync.players.find((p) => p.nickname === nickname)!.playerId);
    const codes = nicknames.map((nickname) => sync.players.find((p) => p.nickname === nickname)!.code);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    const match = sync.matches.find((m) => m.players.some((p) => p.playerId === ids[0]))!;
    expect(match).toMatchObject({ state: 'called', nextGame: 1, scoreToWin: 21, speed: 90, wins1: 0, wins2: 0 });
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
    await page.getByRole('button', { name: `New join code for ${nickname}` }).click();
    await expect(page.getByRole('status')).toHaveText(`${nickname} has a new join code. The old code stops working.`);
    // The admin page does not show codes.
    await expect(page.getByText(before)).toHaveCount(0);

    const after = (await readSync(request)).players.find((p) => p.nickname === nickname)!.code;
    expect(after).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    expect(after).not.toBe(before);
});
