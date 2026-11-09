import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

const auth = () => ({ authorization: `Bearer ${process.env.E2E_GAME_SERVER_TOKEN ?? ''}` });
const sameOrigin = { 'sec-fetch-site': 'same-origin' };
// These sign-ups come from their own made-up network, so they do not use up the limit the other tests share.
const network = { 'x-e2e-client': '192.0.2.30' };
// Set BIG_SCREEN_SHOTS to a folder to save screenshots there. Run the spec on its own then, so the
// first shot shows the screen before anything is played.
const shots = process.env.BIG_SCREEN_SHOTS;

// The first test takes the empty shot before anything is played, so the tests run one after another.
test.describe.configure({ mode: 'default' });

async function adminContext(browser: Browser, baseURL: string | undefined) {
    const admin = await browser.newContext({ baseURL });
    await admin.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    return admin;
}

async function signUp(browser: Browser, nickname: string): Promise<BrowserContext> {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, extraHTTPHeaders: network });
    const page = await context.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    return context;
}

type Sync = { players: { playerId: number; nickname: string }[]; matches: { matchId: number; players: { playerId: number }[] }[] };
const sync = async (context: BrowserContext): Promise<Sync> => (await context.request.get('/api/server/sync', { headers: auth() })).json();

/** One player asks the other for a 1v1 and the other accepts, so the match is called. Returns its id. */
async function playDuel(asker: BrowserContext, asked: BrowserContext, askedId: number, settings: Record<string, string>) {
    const sent = await asker.request.post('/api/player/challenges', { form: { opponent: String(askedId), ...settings }, headers: sameOrigin, maxRedirects: 0 });
    expect(sent.headers()['location']).toBe('/me?challenge=sent#utfordringa');
    const before = new Set((await sync(asked)).matches.map((m) => m.matchId));
    const page = await asked.newPage();
    await page.goto('/me');
    await page.getByRole('list', { name: 'Utfordringa te deg' }).getByRole('button', { name: 'Godta' }).click();
    await expect(page.getByRole('status')).toHaveText('Du godtok kampen. Dåkke kan spela med ein gang.');
    await page.close();
    const called = (await sync(asked)).matches.find((m) => !before.has(m.matchId) && m.players.some((p) => p.playerId === askedId));
    return called!.matchId;
}

test('the 1v1 screen shows a live 1v1, a finished 1v1 and the next tournament match', async ({ browser, baseURL }) => {
    test.slow();
    const tag = randomBytes(2).toString('hex');
    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    const region = page.getByRole('region', { name: '1v1 og neste kampa' });

    if (shots) {
        await page.goto('/big?screen=duels');
        await expect(region).toContainText('Ingen 1v1 og ingen kampa på vei ennå.');
        await page.screenshot({ path: join(shots, 'screen-duels-empty-1920x1080.png') });
    }

    const [liveA, liveB, doneA, doneB, cupA, cupB] = ['Raket', 'Komet', 'Bolle', 'Kringla', 'Finka', 'Spurv'].map((n) => `${n}${tag}`);
    const players = new Map<string, BrowserContext>();
    for (const nickname of [liveA, liveB, doneA, doneB, cupA, cupB]) players.set(nickname, await signUp(browser, nickname));
    const admin = await adminContext(browser, baseURL);
    const idOf = new Map((await sync(admin)).players.map((p) => [p.nickname, p.playerId]));
    const id = (nickname: string) => idOf.get(nickname)!;

    // A live 1v1 with a bet on it and a score from the game server.
    const live = await playDuel(players.get(liveA)!, players.get(liveB)!, id(liveB), { bestOf: '3', scoreToWin: '21', speed: '90' });
    const bet = await players.get(doneA)!.request.post('/api/player/bets', { form: { matchId: String(live), on: String(id(liveA)), amount: '120' }, headers: sameOrigin, maxRedirects: 0 });
    expect(bet.status()).toBe(303);
    expect(await (await admin.request.post(`/api/server/matches/${live}/connected`, { headers: auth(), data: { playerIds: [id(liveA), id(liveB)] } })).json()).toEqual({ status: 'started' });
    const score = { matchId: live, game: 1, points: [{ playerId: id(liveA), points: 7 }, { playerId: id(liveB), points: 3 }] };
    expect(await (await admin.request.post('/api/server/live', { headers: auth(), data: score })).json()).toEqual({ status: 'stored' });

    // A 1v1 played to the end from the admin match page.
    const done = await playDuel(players.get(doneA)!, players.get(doneB)!, id(doneB), {});
    const adminPage = await admin.newPage();
    await adminPage.goto(`/admin/matches/${done}`);
    await adminPage.getByLabel('Result').selectOption({ label: `${doneB} won` });
    await adminPage.getByLabel(`Points for ${doneB}`).fill('15');
    await adminPage.getByLabel(`Points for ${doneA}`).fill('6');
    await adminPage.getByRole('button', { name: 'Save game' }).click();
    await expect(adminPage.getByRole('status')).toHaveText('The game result is saved.');

    // A tournament of two, so its final is the next match to call.
    const cup = `Duellcupen ${tag}`;
    await adminPage.goto('/admin/tournaments/new');
    await adminPage.getByLabel('Name').fill(cup);
    for (const nickname of [cupA, cupB]) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name: cup })).toBeVisible();
    const tournamentId = adminPage.url().match(/\/admin\/tournaments\/(\d+)/)![1];

    // The admin can put the screen in the rotation like the others.
    await adminPage.goto('/admin/events');
    await adminPage.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    await expect(adminPage.getByLabel('Use the 1v1s and next up screen')).toBeVisible();
    await expect(adminPage.getByLabel('Order of the 1v1s and next up screen')).toBeVisible();
    await admin.close();
    for (const context of players.values()) await context.close();

    await page.goto(`/big?t=${tournamentId}&screen=duels`);
    await expect(page.locator('main')).toHaveAttribute('data-screen', 'duels');

    const liveRow = region.getByRole('region', { name: '1v1 i ringen' }).getByRole('listitem', { name: `${liveA} mot ${liveB}` });
    await expect(liveRow).toContainText('LIVE');
    await expect(liveRow).toContainText('7–3');
    await expect(liveRow).toContainText('Sett 1 · 0–0 i sett · Best av 3 · Vanlig · først te 21 · 90 fps');
    await expect(liveRow).toContainText('120 Foza i potten');

    const doneRow = region.getByRole('region', { name: 'Tidligere kampa' }).getByRole('listitem', { name: `${doneA} mot ${doneB}` });
    await expect(doneRow).toContainText('0–1');

    // The seeding may put either player first.
    const cupRow = region.getByRole('region', { name: 'Neste i turneringa' }).getByRole('listitem').filter({ hasText: cupA }).filter({ hasText: cupB });
    await expect(cupRow).toContainText('SNART');
    await expect(cupRow).toContainText(`Finale, kamp 1 · ${cup} · best av`);

    // Nothing scrolls on the TV.
    const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    expect(size).toEqual({ w: 1920, h: 1080 });
    if (shots) await page.screenshot({ path: join(shots, 'screen-duels-1920x1080.png') });
    await screen.close();
});

test('a busy 1v1 screen trims the lists and fits the TV', async ({ browser, baseURL }) => {
    test.skip(!shots, 'Only for the screenshots.');
    test.setTimeout(300_000);
    const tag = randomBytes(2).toString('hex');
    const pairs = ['Ape', 'Bjørn', 'Elg', 'Gaupe', 'Hare', 'Ilder'].map((n) => [`${n}${tag}`, `${n}2${tag}`] as const);
    const cupPlayers = ['Kaja', 'Lomvi', 'Måke', 'Ravn', 'Svale', 'Terne', 'Ugle', 'Vipe'].map((n) => `${n}${tag}`);
    const players = new Map<string, BrowserContext>();
    for (const nickname of [...pairs.flat(), ...cupPlayers]) players.set(nickname, await signUp(browser, nickname));
    const admin = await adminContext(browser, baseURL);
    const idOf = new Map((await sync(admin)).players.map((p) => [p.nickname, p.playerId]));
    const id = (nickname: string) => idOf.get(nickname)!;

    // Six 1v1 matches on the floor: two live, one with a bet still open.
    const duels: number[] = [];
    for (const [a, b] of pairs) duels.push(await playDuel(players.get(a)!, players.get(b)!, id(b), { bestOf: '3' }));
    const bet = await players.get(cupPlayers[0])!.request.post('/api/player/bets', { form: { matchId: String(duels[2]), on: String(id(pairs[2][0])), amount: '250' }, headers: sameOrigin, maxRedirects: 0 });
    expect(bet.status()).toBe(303);
    for (const [i, matchId] of duels.slice(0, 2).entries()) {
        const [a, b] = pairs[i];
        await admin.request.post(`/api/server/matches/${matchId}/connected`, { headers: auth(), data: { playerIds: [id(a), id(b)] } });
        await admin.request.post('/api/server/live', { headers: auth(), data: { matchId, game: 1, points: [{ playerId: id(a), points: 9 + i }, { playerId: id(b), points: 4 }] } });
    }

    // A tournament of eight with two of its quarterfinals called.
    const cup = `Fuglecupen ${tag}`;
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/tournaments/new');
    await adminPage.getByLabel('Name').fill(cup);
    for (const nickname of cupPlayers) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name: cup })).toBeVisible();
    const tournamentId = adminPage.url().match(/\/admin\/tournaments\/(\d+)/)![1];
    await adminPage.goto('/admin/matches');
    const rows = adminPage.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(cup) });
    await rows.nth(0).getByRole('checkbox').check();
    await rows.nth(1).getByRole('checkbox').check();
    await adminPage.getByRole('button', { name: 'Call selected matches' }).click();
    await expect(adminPage.getByRole('status')).toHaveText(/^Called match/);

    // Sponsors, so the strip shows under the screen.
    await adminPage.goto('/admin/events');
    await adminPage.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    for (const [i, colour] of ['#c8321f', '#f6c445', '#3e7a2f'].entries()) {
        await adminPage.getByRole('button', { name: 'Add sponsor' }).click();
        const form = adminPage.getByRole('form', { name: 'Add a sponsor' });
        await form.getByLabel('Name').fill(`Sponsor ${i + 1} ${tag}`);
        const logo = await sharp({ create: { width: 300, height: 100, channels: 4, background: colour } }).png().toBuffer();
        await form.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
        await form.getByRole('button', { name: 'Add sponsor' }).click();
        await expect(adminPage.getByRole('status')).toHaveText(`Saved the sponsor Sponsor ${i + 1} ${tag}.`);
    }
    await admin.close();
    for (const context of players.values()) await context.close();

    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    await page.goto(`/big?t=${tournamentId}&screen=duels`);
    const region = page.getByRole('region', { name: '1v1 og neste kampa' });
    await expect(region.getByRole('region', { name: '1v1 i ringen' }).getByRole('listitem')).toHaveCount(4);
    await expect(region).toContainText('+ 3 kampa te');
    await expect(region.getByRole('region', { name: 'Neste i turneringa' }).getByRole('listitem')).toHaveCount(4);
    await expect(region).toContainText('ROPT OPP');
    const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    expect(size).toEqual({ w: 1920, h: 1080 });
    for (const name of ['1v1 i ringen', 'Neste i turneringa', 'Tidligere kampa']) {
        const box = (await region.getByRole('region', { name }).boundingBox())!;
        const strip = (await page.locator('main > footer').boundingBox())!;
        expect(box.y + box.height, name).toBeLessThanOrEqual(strip.y + 1);
    }
    await page.screenshot({ path: join(shots!, 'screen-duels-busy-1920x1080.png') });
    await screen.close();
});
