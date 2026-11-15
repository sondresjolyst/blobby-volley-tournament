import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

const auth = () => ({ authorization: `Bearer ${process.env.E2E_GAME_SERVER_TOKEN ?? ''}` });
const sameOrigin = { 'sec-fetch-site': 'same-origin' };
// These sign-ups come from their own made-up network, so they do not use up the limit the other tests share.
const network = { 'x-e2e-client': '192.0.2.50' };

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

type Sync = { players: { playerId: number; nickname: string }[]; matches: { matchId: number; players: { playerId: number }[]; training?: unknown }[] };
const sync = async (context: BrowserContext): Promise<Sync> => (await context.request.get('/api/server/sync', { headers: auth() })).json();

interface Duel {
    id: number;
    /** The player ids in the order of the match page: player 1, then player 2. */
    ids: [number, number];
    names: [string, string];
    contexts: BrowserContext[];
}

/** Two new players and a 1v1 between them that is accepted and connected. The challenger is the first player. */
async function startDuel(browser: Browser, settings: Record<string, string>): Promise<Duel> {
    const tag = randomBytes(2).toString('hex');
    const names: [string, string] = [`Raket${tag}`, `Komet${tag}`];
    const [asker, asked] = [await signUp(browser, names[0]), await signUp(browser, names[1])];
    const players = new Map((await sync(asked)).players.map((p) => [p.nickname, p.playerId]));
    const ids: [number, number] = [players.get(names[0])!, players.get(names[1])!];
    const sent = await asker.request.post('/api/player/challenges', { form: { opponent: String(ids[1]), ...settings }, headers: sameOrigin, maxRedirects: 0 });
    expect(sent.headers()['location']).toBe('/me?challenge=sent#utfordringa');
    const before = new Set((await sync(asked)).matches.map((m) => m.matchId));
    const page = await asked.newPage();
    await page.goto('/me');
    await page.getByRole('list', { name: 'Utfordringa te deg' }).getByRole('button', { name: 'Godta' }).click();
    await expect(page.getByRole('status')).toHaveText('Du godtok kampen. Dåkke kan spela med ein gang.');
    await page.close();
    const called = (await sync(asked)).matches.find((m) => !before.has(m.matchId) && m.players.some((p) => p.playerId === ids[1]))!;
    const connected = await asked.request.post(`/api/server/matches/${called.matchId}/connected`, { headers: auth(), data: { playerIds: ids } });
    expect(await connected.json()).toEqual({ status: 'started' });
    return { id: called.matchId, ids, names, contexts: [asker, asked] };
}

const line = (playerId: number, ballSteps: number, touches: number, errors: number, netHits: number) => ({ playerId, ballSteps, touches, errors, netHits });
const gameStats = (a: ReturnType<typeof line>, b: ReturnType<typeof line>, rallies: number, longestRally: number, rallyTouches: number) => ({ players: [a, b], rallies, longestRally, rallyTouches });

async function report(context: BrowserContext, duel: Duel, game: number, pointsA: number, pointsB: number, stats?: object) {
    const data = {
        reportId: randomUUID(),
        matchId: duel.id,
        game,
        status: 'finished',
        winnerId: pointsA > pointsB ? duel.ids[0] : duel.ids[1],
        points: [
            { playerId: duel.ids[0], points: pointsA },
            { playerId: duel.ids[1], points: pointsB },
        ],
        ...(stats ? { stats } : {}),
        startedAt: '2026-11-20T18:00:00Z',
        endedAt: '2026-11-20T18:05:00Z',
    };
    expect(await (await context.request.post('/api/server/games', { headers: auth(), data })).json()).toEqual({ status: 'stored' });
}

test('finished match shows stats for both players', async ({ browser }) => {
    const duel = await startDuel(browser, { bestOf: '3', scoreToWin: '15', speed: '75' });
    const [ctx] = duel.contexts;
    const [a, b] = duel.ids;
    const [x, y] = duel.names;
    await report(ctx, duel, 1, 15, 8, gameStats(line(a, 4000, 30, 2, 1), line(b, 6000, 20, 4, 0), 10, 8, 50));
    await report(ctx, duel, 2, 15, 12, gameStats(line(a, 2000, 10, 0, 2), line(b, 2000, 10, 2, 0), 5, 12, 20));

    const page = await ctx.newPage();
    await page.goto(`/kamp/${duel.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${x} vs ${y}`);
    await expect(page.getByText('Best av 3 · Vanlig · først te 15 · 75 fps')).toBeVisible();

    // The whole match first. The left side is player 1.
    const whole = page.getByRole('region', { name: 'Heile kampen' });
    await expect(whole.getByRole('group', { name: 'Ballinnehav' })).toHaveText(`Ballinnehav43 %${x}57 %${y}`);
    await expect(whole.getByRole('group', { name: 'Touch' })).toHaveText(`Touch40${x}30${y}`);
    await expect(whole.getByRole('group', { name: 'Feil' })).toHaveText(`Feil2${x}6${y}`);
    await expect(whole.getByRole('group', { name: 'Nett-treff' })).toHaveText(`Nett-treff3${x}0${y}`);
    await expect(whole.getByRole('group', { name: 'Ballvekslingar' })).toContainText('15');
    await expect(whole.getByRole('group', { name: 'Lengste ballveksling' })).toContainText('12');
    await expect(whole.getByRole('group', { name: 'Snitt ballveksling' })).toContainText('4,7');

    const first = page.getByRole('region', { name: 'Sett 1' });
    await expect(first).toContainText('15–8');
    await expect(first.getByRole('group', { name: 'Touch' })).toHaveText(`Touch30${x}20${y}`);
    const second = page.getByRole('region', { name: 'Sett 2' });
    await expect(second).toContainText('15–12');
    await expect(second.getByRole('group', { name: 'Ballinnehav' })).toContainText('50 %');
    await expect(page.getByText('Ingen statistikk for dette settet')).toHaveCount(0);
    await Promise.all(duel.contexts.map((c) => c.close()));
});

test('match without stats shows score only', async ({ browser }) => {
    const duel = await startDuel(browser, {});
    await report(duel.contexts[0], duel, 1, 15, 6);
    const page = await duel.contexts[0].newPage();
    await page.goto(`/kamp/${duel.id}`);
    const game = page.getByRole('region', { name: 'Sett 1' });
    await expect(game).toContainText('15–6');
    await expect(game).toContainText('Ingen statistikk for dette settet');
    await expect(game.getByRole('group')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Heile kampen' })).toHaveCount(0);
    await Promise.all(duel.contexts.map((c) => c.close()));
});

test('running match updates stats from live', async ({ browser }) => {
    test.slow();
    const duel = await startDuel(browser, { bestOf: '3' });
    const [ctx] = duel.contexts;
    const [a, b] = duel.ids;
    const [x, y] = duel.names;
    const live = async (pointsA: number, pointsB: number, touchesA: number) =>
        (
            await ctx.request.post('/api/server/live', {
                headers: auth(),
                data: { matchId: duel.id, game: 1, points: [{ playerId: a, points: pointsA }, { playerId: b, points: pointsB }], stats: gameStats(line(a, 100, touchesA, 1, 0), line(b, 300, 4, 2, 1), 2, 3, 7) },
            })
        ).json();
    expect(await live(1, 0, 5)).toEqual({ status: 'stored' });

    const page = await ctx.newPage();
    await page.goto(`/kamp/${duel.id}`);
    const running = page.getByRole('region', { name: 'Sett 1 · LIVE' });
    await expect(running.getByRole('group', { name: 'Touch' })).toHaveText(`Touch5${x}4${y}`, { timeout: 10_000 });
    await expect(running).toContainText('1–0');
    await expect(running.getByRole('group', { name: 'Ballinnehav' })).toContainText('25 %');

    expect(await live(2, 0, 9)).toEqual({ status: 'stored' });
    await expect(running.getByRole('group', { name: 'Touch' })).toHaveText(`Touch9${x}4${y}`, { timeout: 10_000 });
    await expect(running).toContainText('2–0');

    // When the game ends the page loads again and shows the final stats of the game.
    await report(ctx, duel, 1, 15, 3, gameStats(line(a, 900, 33, 1, 0), line(b, 700, 21, 2, 1), 6, 9, 40));
    const done = page.getByRole('region', { name: 'Sett 1', exact: true });
    await expect(done.getByRole('group', { name: 'Touch' })).toHaveText(`Touch33${x}21${y}`, { timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Sett 1 · LIVE' })).toHaveCount(0);
    await Promise.all(duel.contexts.map((c) => c.close()));
});

test('training game page shows the bot name', async ({ browser }) => {
    const nickname = `Tr${randomBytes(2).toString('hex')}`;
    const context = await signUp(browser, nickname);
    const page = await context.newPage();
    await page.goto('/trening');
    const form = page.getByRole('region', { name: 'Tren mot bot' });
    await form.getByLabel('Bot').selectOption('hyp014');
    await form.getByLabel('Vanskegrad', { exact: true }).fill('13');
    await form.getByLabel('Først te').fill('5');
    await form.getByRole('button', { name: 'Start treninga' }).click();
    await expect(page.getByText(`${nickname} vs Bot (hyp014, vanskegrad 13)`).first()).toBeVisible();

    const everything = await sync(context);
    const playerId = everything.players.find((p) => p.nickname === nickname)!.playerId;
    const training = everything.matches.find((m) => m.training && m.players[0]?.playerId === playerId)!;
    expect(await (await context.request.post(`/api/server/matches/${training.matchId}/connected`, { headers: auth(), data: { playerIds: [playerId, 0] } })).json()).toEqual({ status: 'started' });
    const data = {
        reportId: randomUUID(),
        matchId: training.matchId,
        game: 1,
        status: 'finished',
        winnerId: playerId,
        points: [{ playerId, points: 5 }, { playerId: 0, points: 2 }],
        stats: gameStats(line(playerId, 1000, 8, 6, 4), line(0, 3000, 6, 1, 0), 4, 5, 10),
        startedAt: '2026-11-20T18:00:00Z',
        endedAt: '2026-11-20T18:02:00Z',
        training: true,
    };
    expect(await (await context.request.post('/api/server/games', { headers: auth(), data })).json()).toEqual({ status: 'stored' });

    await page.goto(`/kamp/${training.matchId}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${nickname} vs Bot (hyp014, vanskegrad 13)`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('TRENING');
    await expect(page.getByText('Bot hyp014 · vanskegrad 13 · Vanlig · først te 5 · 75 fps')).toBeVisible();
    const game = page.getByRole('region', { name: 'Sett 1' });
    await expect(game).toContainText('5–2');
    await expect(game.getByRole('group', { name: 'Ballinnehav' })).toHaveText(`Ballinnehav25 %${nickname}75 %Bot (hyp014, vanskegrad 13)`);
    await expect(game.getByRole('group', { name: 'Touch' })).toContainText('8');
    await context.close();
});

test('an unknown match gives not found', async ({ page }) => {
    expect((await page.goto('/kamp/99999999'))?.status()).toBe(404);
    expect((await page.goto('/kamp/abc'))?.status()).toBe(404);
});

test('resultat filter Bob vs Kevin', async ({ browser }) => {
    const duel = await startDuel(browser, {});
    const other = await startDuel(browser, {});
    await report(duel.contexts[0], duel, 1, 15, 6);
    await report(other.contexts[0], other, 1, 15, 9);
    const page = await duel.contexts[0].newPage();
    const [a, b] = duel.ids;
    await page.goto('/resultat');
    await expect(page.getByRole('banner').getByRole('navigation').getByRole('link', { name: 'Resultat', exact: true })).toHaveAttribute('aria-current', 'page');

    // The form works as a plain GET form: pick two players and submit.
    await page.getByLabel('Spelar').selectOption(String(a));
    await page.getByLabel('Motstandar').selectOption(String(b));
    await page.getByRole('button', { name: 'Vis' }).click();
    expect(page.url()).toMatch(new RegExp(`/resultat[?]spelar=${a}&mot=${b}$`));
    const games = page.getByRole('list', { name: 'Kampa' }).getByRole('listitem');
    await expect(games).toHaveCount(1);
    await expect(games.first()).toContainText(`${duel.names[0]} vs ${duel.names[1]}`);
    await expect(games.first()).toContainText('1–0');
    await expect(games.first()).toContainText('1v1');
    await expect(games.first().getByRole('link', { name: 'Sjå kampen' })).toHaveAttribute('href', `/kamp/${duel.id}`);
    await expect(games.filter({ hasText: other.names[0] })).toHaveCount(0);

    // A player and an opponent that never met.
    await page.goto(`/resultat?spelar=${a}&mot=${other.ids[0]}`);
    await expect(page.getByText('Ingen kampa funne med dette utvalget.')).toBeVisible();

    // An id that is not a player shows the full list.
    await page.goto('/resultat?spelar=999999999&mot=abc');
    await expect(games.filter({ hasText: other.names[0] })).toHaveCount(1);
    await expect(games.filter({ hasText: duel.names[0] })).toHaveCount(1);
    await Promise.all([...duel.contexts, ...other.contexts].map((c) => c.close()));
});

/** One more finished best-of-1 match between the two players of the duel, played by API calls. */
async function rematch(duel: Duel): Promise<number> {
    const [asker, asked] = duel.contexts;
    const before = new Set((await sync(asked)).matches.map((m) => m.matchId));
    await asker.request.post('/api/player/challenges', { form: { opponent: String(duel.ids[1]) }, headers: sameOrigin, maxRedirects: 0 });
    const waiting = await asked.newPage();
    await waiting.goto('/me');
    await waiting.getByRole('list', { name: 'Utfordringa te deg' }).getByRole('button', { name: 'Godta' }).click();
    await expect(waiting.getByRole('status')).toHaveText('Du godtok kampen. Dåkke kan spela med ein gang.');
    await waiting.close();
    const called = (await sync(asked)).matches.find((m) => !before.has(m.matchId) && m.players.some((p) => p.playerId === duel.ids[1]))!;
    await asked.request.post(`/api/server/matches/${called.matchId}/connected`, { headers: auth(), data: { playerIds: duel.ids } });
    await report(asker, { ...duel, id: called.matchId }, 1, 15, 3);
    return called.matchId;
}

test('resultat pages the list and keeps the filter on page 2', async ({ browser }) => {
    const duel = await startDuel(browser, {});
    await report(duel.contexts[0], duel, 1, 15, 3);
    for (let i = 0; i < 11; i++) await rematch(duel);
    const [a, b] = duel.ids;
    const page = await duel.contexts[0].newPage();
    const games = page.getByRole('list', { name: 'Kampa' }).getByRole('listitem');
    const pager = page.getByRole('navigation', { name: 'Sidene i lista' });

    await page.goto(`/resultat?spelar=${a}&mot=${b}`);
    await expect(games).toHaveCount(10);
    await expect(pager.getByText('1 te 10 av 12 spel')).toBeVisible();
    await expect(pager.getByRole('link', { name: 'Side 1' })).toHaveAttribute('aria-current', 'page');
    await expect(pager.getByText('Førre')).toHaveAttribute('aria-disabled', 'true');

    // The next link keeps the filter and works without scripts: it is a plain link.
    await pager.getByRole('link', { name: 'Neste' }).click();
    await expect(page).toHaveURL(new RegExp(`/resultat[?]spelar=${a}&mot=${b}&side=2$`));
    await expect(games).toHaveCount(2);
    await expect(pager.getByText('11 te 12 av 12 spel')).toBeVisible();
    await expect(pager.getByRole('link', { name: 'Side 2' })).toHaveAttribute('aria-current', 'page');
    await expect(pager.getByText('Neste')).toHaveAttribute('aria-disabled', 'true');

    // A page past the last shows the last page.
    await page.goto(`/resultat?spelar=${a}&mot=${b}&side=99`);
    await expect(games).toHaveCount(2);

    // Submitting the filter form starts at page 1.
    await page.goto(`/resultat?spelar=${a}&mot=${b}&side=2`);
    await page.getByRole('button', { name: 'Vis' }).click();
    await expect(page).toHaveURL(new RegExp(`/resultat[?]spelar=${a}&mot=${b}$`));
    await expect(games).toHaveCount(10);
    await Promise.all(duel.contexts.map((c) => c.close()));
});
