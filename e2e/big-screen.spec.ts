import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test, type Browser, type Page } from '@playwright/test';

const auth = () => ({ authorization: `Bearer ${process.env.E2E_GAME_SERVER_TOKEN ?? ''}` });
// Set BIG_SCREEN_SHOTS to a folder to add sponsors and save screenshots there. Run the spec on its own
// then, since the sponsors show under every page.
const shots = process.env.BIG_SCREEN_SHOTS;
const code = process.env.E2E_EVENT_CODE ?? '';

// The last test makes a new big screen key, so the tests of this file run one after another.
test.describe.configure({ mode: 'default' });

async function adminContext(browser: Browser, baseURL: string | undefined) {
    const admin = await browser.newContext({ baseURL });
    await admin.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    return admin;
}

/** The big screen key of the active event, from the link on /admin. */
async function currentKey(browser: Browser, baseURL: string | undefined): Promise<string> {
    const admin = await adminContext(browser, baseURL);
    const page = await admin.newPage();
    await page.goto('/admin');
    const href = (await page.getByRole('link', { name: 'Big screen' }).getAttribute('href'))!;
    await admin.close();
    const key = new URL(href, 'https://localhost').searchParams.get('key');
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return key!;
}

async function signUp(browser: Browser, nickname: string) {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const page = await context.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    return context;
}

// Players for the tournaments of the screen tests. The site takes 50 sign-ups an hour from one
// network, so the tests share them.
const fieldTag = randomBytes(2).toString('hex');
const field: string[] = [];

/** The first `n` shared players, signed up when needed. */
async function bigField(browser: Browser, n: number): Promise<string[]> {
    while (field.length < n) {
        const nickname = `F${field.length + 1}${fieldTag}`;
        await (await signUp(browser, nickname)).close();
        field.push(nickname);
    }
    return field.slice(0, n);
}

/** Saves a tournament of players who signed up already. Returns its id. */
async function newTournament(browser: Browser, baseURL: string | undefined, name: string, nicknames: string[], options: { format?: string; bestOf?: string } = {}) {
    const admin = await adminContext(browser, baseURL);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/tournaments/new');
    await adminPage.getByLabel('Name').fill(name);
    if (options.format) await adminPage.getByLabel('Format').selectOption({ label: options.format });
    for (const nickname of nicknames) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    if (options.bestOf) for (const select of await adminPage.getByLabel(/^Best of for /).all()) await select.selectOption(options.bestOf);
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name })).toBeVisible();
    const id = adminPage.url().match(/\/admin\/tournaments\/(\d+)/)![1];
    await admin.close();
    return id;
}

/** The big screen screens form on the page of the E2E event. */
async function openScreensForm(page: Page) {
    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'Screens' })).toBeVisible();
}

const SCREEN_NAMES = { overview: 'Overview', bracket: 'Bracket', foza: 'Foza', next: 'Up next', stats: 'Stats', sponsors: 'Sponsors', winner: 'Winner' } as const;
type Screen = keyof typeof SCREEN_NAMES;

/** Saves the screens of the big screen, in this order, and the seconds on each. */
async function saveScreens(page: Page, screens: Screen[], seconds: number) {
    await openScreensForm(page);
    const all = Object.keys(SCREEN_NAMES) as Screen[];
    const order = [...screens, ...all.filter((s) => !screens.includes(s))];
    for (const [i, type] of order.entries()) {
        await page.getByLabel(`Use the ${SCREEN_NAMES[type]} screen`).setChecked(screens.includes(type));
        await page.getByLabel(`Order of the ${SCREEN_NAMES[type]} screen`).fill(String(i + 1));
    }
    await page.getByLabel('Seconds on each screen').fill(String(seconds));
    await page.getByRole('button', { name: 'Save screens' }).click();
    // The form posts in the background, and the notice can be there from the last save.
    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Saved the screens.');
}

/** Calls a match and enters its games from the admin match page. Each game is the slot that won and the points of both. */
async function playMatch(page: Page, matchId: number, games: [1 | 2, number, number][]) {
    await page.goto(`/admin/matches/${matchId}`);
    await page.getByRole('button', { name: 'Call match' }).click();
    for (const [winner, points1, points2] of games) {
        await expect(page.getByRole('button', { name: 'Save game' })).toBeVisible();
        await page.getByLabel('Result').selectOption(String(winner));
        const points = page.getByLabel(/^Points for /);
        await points.nth(0).fill(String(points1));
        await points.nth(1).fill(String(points2));
        await page.getByRole('button', { name: 'Save game' }).click();
        // The form posts in the background. The notice of the last game is still there until the answer comes.
        await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
        await expect(page.getByRole('status')).toHaveText('The game result is saved.');
    }
}

/** The page fits the window: nothing scrolls and every part is inside it. */
async function expectFits(page: Page, regions = ['Kampen nå', 'Kampoppsett', 'Toppliste', 'Bli med']) {
    const size = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        width: window.innerWidth,
        height: window.innerHeight,
    }));
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
    expect(size.scrollHeight).toBeLessThanOrEqual(size.height);
    for (const name of regions) {
        const box = (await page.getByRole('region', { name }).boundingBox())!;
        expect(box.y + box.height, name).toBeLessThanOrEqual(size.height + 1);
        expect(box.x + box.width, name).toBeLessThanOrEqual(size.width + 1);
    }
}

test('the big screen shows the live score, the odds, the bracket and the sign-up code, and follows the score without a reload', async ({ browser, baseURL }) => {
    test.slow();
    const tag = randomBytes(2).toString('hex');
    const nicknames = ['Blob', 'Skvett', 'Oste', 'Kanti'].map((n) => `${n}${tag}`);
    for (const nickname of nicknames) await (await signUp(browser, nickname)).close();
    const bettors = [await signUp(browser, `Tipp${tag}`), await signUp(browser, `Topp${tag}`)];

    const admin = await adminContext(browser, baseURL);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/tournaments/new');
    const name = `Pizzacupen ${tag}`;
    await adminPage.getByLabel('Name').fill(name);
    for (const nickname of nicknames) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    for (const select of await adminPage.getByLabel(/^Best of for /).all()) await select.selectOption('1');
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name })).toBeVisible();
    const tournamentId = adminPage.url().match(/\/admin\/tournaments\/(\d+)/)![1];

    // Both semifinals are called. The final has no players yet.
    await adminPage.goto('/admin/matches');
    const rows = adminPage.getByRole('region', { name: 'Upcoming' }).getByRole('row', { name: new RegExp(name) });
    await rows.nth(0).getByRole('checkbox').check();
    await rows.nth(1).getByRole('checkbox').check();
    await adminPage.getByRole('button', { name: 'Call selected matches' }).click();
    await expect(adminPage.getByRole('status')).toHaveText(/^Called match/);

    const sync = await (await admin.request.get('/api/server/sync', { headers: auth() })).json();
    const idOf = (nickname: string) => sync.players.find((p: { nickname: string }) => p.nickname === nickname).playerId as number;
    const mine = new Set(nicknames.map(idOf));
    const [live, other] = (sync.matches as { matchId: number; players: { playerId: number }[] }[]).filter((m) => m.players.every((p) => mine.has(p.playerId)));
    const nick = (playerId: number) => nicknames.find((n) => idOf(n) === playerId)!;

    // Two bettors back each side of the live match, and one backs the winner of the other.
    for (const [bettor, matchId, on, amount] of [
        [bettors[0], live.matchId, live.players[0].playerId, 300],
        [bettors[1], live.matchId, live.players[1].playerId, 100],
        [bettors[0], other.matchId, other.players[0].playerId, 50],
    ] as const) {
        const res = await bettor.request.post('/api/player/bets', { form: { matchId: String(matchId), on: String(on), amount: String(amount) }, headers: { 'sec-fetch-site': 'same-origin' }, maxRedirects: 0 });
        expect(res.status()).toBe(303);
    }
    for (const bettor of bettors) await bettor.close();

    // The other semifinal is played, so the boards have a result.
    await adminPage.goto(`/admin/matches/${other.matchId}`);
    const winner = nick(other.players[0].playerId);
    await adminPage.getByLabel('Result').selectOption({ label: `${winner} won` });
    await adminPage.getByLabel(`Points for ${winner}`).fill('15');
    await adminPage.getByLabel(`Points for ${nick(other.players[1].playerId)}`).fill('9');
    await adminPage.getByRole('button', { name: 'Save game' }).click();
    await expect(adminPage.getByRole('status')).toHaveText('The game result is saved.');

    const ids = live.players.map((p) => p.playerId);
    const score = (a: number, b: number) => ({ matchId: live.matchId, game: 1, points: [{ playerId: ids[0], points: a }, { playerId: ids[1], points: b }] });
    expect(await (await admin.request.post(`/api/server/matches/${live.matchId}/connected`, { headers: auth(), data: { playerIds: ids } })).json()).toEqual({ status: 'started' });
    expect(await (await admin.request.post('/api/server/live', { headers: auth(), data: score(11, 8) })).json()).toEqual({ status: 'stored' });

    if (shots) {
        await adminPage.goto('/admin/events');
        await adminPage.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
        const colours = ['#c8321f', '#f6c445', '#3e7a2f', '#8a4b1e', '#2a6fdb', '#6b5444', '#e07a2f', '#1f4d22'];
        for (const [i, colour] of colours.entries()) {
            await adminPage.getByRole('button', { name: 'Add sponsor' }).click();
            const form = adminPage.getByRole('form', { name: 'Add a sponsor' });
            await form.getByLabel('Name').fill(`Sponsor ${i + 1} ${tag}`);
            const logo = await sharp({ create: { width: 300, height: 100, channels: 4, background: colour } }).png().toBuffer();
            await form.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
            await form.getByRole('button', { name: 'Add sponsor' }).click();
            await expect(adminPage.getByRole('status')).toHaveText(`Saved the sponsor Sponsor ${i + 1} ${tag}.`);
        }
    }
    await admin.close();

    const key = await currentKey(browser, baseURL);
    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    await page.goto(`/big?t=${tournamentId}&key=${key}`);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E LAN' })).toBeVisible();

    const bracket = page.getByRole('region', { name: 'Kampoppsett' });
    await expect(bracket).toContainText(`KAMPOPPSETT · ${name}`);
    for (const nickname of nicknames) await expect(bracket).toContainText(nickname);
    await expect(bracket).toContainText('Semifinala');

    // The live match is in the big box, or among the matches under it when another test has one live too.
    const floor = page.getByRole('region', { name: /^(Kampen nå|Snart i ringen)$/ });
    const liveBox = floor.filter({ hasText: nick(ids[0]) }).filter({ hasText: nick(ids[1]) }).first();
    await expect(liveBox).toContainText(/11\s*(:|–)\s*8/);

    const signUpBox = page.getByRole('region', { name: 'Bli med' });
    await expect(signUpBox).toContainText(code);
    await expect(signUpBox.getByRole('img', { name: 'QR-kode te https://localhost/join' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Toppliste' })).toBeVisible();
    await expectFits(page);

    // A new score shows without a page load.
    await page.evaluate(() => Object.assign(window, { stillHere: true }));
    const again = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    expect(await (await again.request.post('/api/server/live', { headers: auth(), data: score(12, 8) })).json()).toEqual({ status: 'stored' });
    await again.close();
    await expect(liveBox).toContainText(/12\s*(:|–)\s*8/, { timeout: 15_000 });
    expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
    // The refresh carries the key, so the code stays on the screen.
    await expect(signUpBox).toContainText(code);

    // Without the key the JSON route holds nicknames and numbers only.
    const data = await (await page.request.get(`/api/big?t=${tournamentId}`)).json();
    expect(data.bracket.tournamentId).toBe(Number(tournamentId));
    expect(data.eventCode).toBeNull();
    expect(JSON.stringify(data)).not.toContain(code);

    if (shots) {
        await page.screenshot({ path: join(shots, 'big-1920x1080.png') });
        await page.setViewportSize({ width: 1280, height: 720 });
        await expectFits(page);
        await page.screenshot({ path: join(shots, 'big-1280x720.png') });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.screenshot({ path: join(shots, 'big-1280x720-reduced-motion.png') });
    }
    await screen.close();
});

test('a double elimination bracket of 16 players fits the screen', async ({ browser, baseURL }) => {
    test.skip(!shots, 'Only for the screenshots.');
    test.slow();
    const tag = randomBytes(2).toString('hex');
    const nicknames = await bigField(browser, 16);
    const tournamentId = await newTournament(browser, baseURL, `Storcupen ${tag}`, nicknames, { format: 'Double elimination' });

    const key = await currentKey(browser, baseURL);
    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    await page.goto(`/big?t=${tournamentId}&key=${key}`);
    await expect(page.getByRole('region', { name: 'Kampoppsett' })).toContainText('Vinnarsidå');
    await expect(page.getByRole('region', { name: 'Kampoppsett' })).toContainText('+ 4 kampa te');
    await expectFits(page);
    await page.screenshot({ path: join(shots!, 'big-de16-1920x1080.png') });
    await page.setViewportSize({ width: 1280, height: 720 });
    await expectFits(page);
    await page.screenshot({ path: join(shots!, 'big-de16-1280x720.png') });

    // The bracket screen shows both sides with every round.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/big?t=${tournamentId}&key=${key}&screen=bracket`);
    const full = page.getByRole('region', { name: 'Heile kampoppsettet' });
    await expect(full).toContainText('Tapersidå');
    await expect(full).not.toContainText('kampa te');
    await expectFits(page, ['Heile kampoppsettet']);
    await page.screenshot({ path: join(shots!, 'screen-bracket-de16-1920x1080.png') });
    await screen.close();
});

test('a single elimination bracket of 32 players fits the bracket screen', async ({ browser, baseURL }) => {
    test.skip(!shots, 'Only for the screenshots.');
    test.slow();
    const tag = randomBytes(2).toString('hex');
    const nicknames = await bigField(browser, 32);
    const tournamentId = await newTournament(browser, baseURL, `Kjempecupen ${tag}`, nicknames);
    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    await page.goto(`/big?t=${tournamentId}&screen=bracket`);
    const full = page.getByRole('region', { name: 'Heile kampoppsettet' });
    for (const nickname of [nicknames[0], nicknames[31]]) await expect(full).toContainText(nickname);
    await expectFits(page, ['Heile kampoppsettet']);
    await page.screenshot({ path: join(shots!, 'screen-bracket-se32-1920x1080.png') });
    await screen.close();
});

test('the big screen shows the event code and the QR code only with the right key', async ({ browser, baseURL }) => {
    const key = await currentKey(browser, baseURL);
    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    for (const address of ['/big', '/big?key=e2e-placeholder-wrong', '/big?key=']) {
        const res = await page.goto(address);
        expect(res!.headers()['referrer-policy']).toBe('no-referrer');
        expect(res!.headers()['cache-control']).toContain('no-store');
        await expect(page.getByRole('region', { name: 'Toppliste' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Bli med' })).toHaveCount(0);
        await expect(page.getByRole('img', { name: /^QR-kode/ })).toHaveCount(0);
        expect(await page.content()).not.toContain(code);
        await expectFits(page, ['Kampoppsett', 'Toppliste']);
    }
    // The leaderboard takes the whole right column, down to the sponsors.
    const board = (await page.getByRole('region', { name: 'Toppliste' }).boundingBox())!;
    const bracket = (await page.getByRole('region', { name: 'Kampoppsett' }).boundingBox())!;
    expect(board.y + board.height).toBeGreaterThanOrEqual(bracket.y + bracket.height - 40);
    if (shots) {
        await page.screenshot({ path: join(shots, 'big-no-key-1920x1080.png') });
        await page.setViewportSize({ width: 1280, height: 720 });
        await expectFits(page, ['Kampoppsett', 'Toppliste']);
        await page.screenshot({ path: join(shots, 'big-no-key-1280x720.png') });
        await page.setViewportSize({ width: 1920, height: 1080 });
    }

    for (const address of ['/api/big', '/api/big?key=e2e-placeholder-wrong']) {
        const res = await page.request.get(address);
        expect(res.headers()['referrer-policy']).toBe('no-referrer');
        const body = await res.text();
        expect(body).not.toContain(code);
        expect(body).not.toContain(key);
        expect(JSON.parse(body).eventCode).toBeNull();
    }
    const keyed = await (await page.request.get(`/api/big?key=${key}`)).json();
    expect(keyed.eventCode).toBe(code);
    expect(JSON.stringify(keyed)).not.toContain(key);

    await page.goto(`/big?key=${key}`);
    const signUpBox = page.getByRole('region', { name: 'Bli med' });
    await expect(signUpBox).toContainText(code);
    await expect(signUpBox.getByRole('img', { name: 'QR-kode te https://localhost/join' })).toBeVisible();
    await expectFits(page);
    await screen.close();
});

test('an admin sees the big screen address and makes a new key, and the old address stops showing the join card', async ({ browser, baseURL }) => {
    const old = await currentKey(browser, baseURL);
    const admin = await adminContext(browser, baseURL);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/events');
    await adminPage.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    const address = adminPage.getByLabel('Big screen address');
    await expect(address).toHaveValue(`https://localhost/big?key=${old}`);

    // The box must be checked first.
    await adminPage.getByRole('button', { name: 'Make a new key' }).click();
    await expect(address).toHaveValue(`https://localhost/big?key=${old}`);
    await adminPage.getByLabel('I understand the old address stops showing the join card').check();
    await adminPage.getByRole('button', { name: 'Make a new key' }).click();
    await expect(adminPage.getByRole('status')).toHaveText('Made a new big screen key. Open the new address on the TV, since the old one no longer shows the join card.');
    const fresh = new URL(await address.inputValue()).searchParams.get('key')!;
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fresh).not.toBe(old);
    await admin.close();
    expect(await currentKey(browser, baseURL)).toBe(fresh);

    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    await page.goto(`/big?key=${old}`);
    await expect(page.getByRole('region', { name: 'Toppliste' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Bli med' })).toHaveCount(0);
    expect(await page.content()).not.toContain(code);
    expect((await (await page.request.get(`/api/big?key=${old}`)).json()).eventCode).toBeNull();

    await page.goto(`/big?key=${fresh}`);
    await expect(page.getByRole('region', { name: 'Bli med' })).toContainText(code);
    expect((await (await page.request.get(`/api/big?key=${fresh}`)).json()).eventCode).toBe(code);
    await screen.close();
});

test('an admin picks the screens of the big screen, and an open big screen follows without a reload', async ({ browser, baseURL }) => {
    test.slow();
    const tag = randomBytes(2).toString('hex');
    await newTournament(browser, baseURL, `Rundecupen ${tag}`, await bigField(browser, 2));
    const admin = await adminContext(browser, baseURL);
    const adminPage = await admin.newPage();
    await adminPage.setViewportSize({ width: 1920, height: 1080 });
    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    const main = page.locator('main');
    try {
        // Nothing changes for an event until the admin picks more screens.
        await openScreensForm(adminPage);
        await expect(adminPage.getByLabel('Use the Overview screen')).toBeChecked();
        await expect(adminPage.getByLabel('Use the Bracket screen')).not.toBeChecked();
        await expect(adminPage.getByLabel('Seconds on each screen')).toHaveValue('60');
        await page.goto('/big');
        await expect(main).toHaveAttribute('data-screen', 'overview');
        await page.evaluate(() => Object.assign(window, { stillHere: true }));

        // One screen alone stays up.
        await saveScreens(adminPage, ['next'], 10);
        await expect(main).toHaveAttribute('data-screen', 'next', { timeout: 15_000 });

        // Two screens take turns in the order set, ten seconds each.
        await saveScreens(adminPage, ['bracket', 'overview'], 10);
        await expect(adminPage.getByLabel('Order of the Bracket screen')).toHaveValue('1');
        await expect(adminPage.getByLabel('Use the Up next screen')).not.toBeChecked();
        await expect(main).toHaveAttribute('data-screen', 'bracket', { timeout: 15_000 });
        await expect(page.getByRole('region', { name: 'Heile kampoppsettet' })).toBeVisible();
        await expect(main).toHaveAttribute('data-screen', 'overview', { timeout: 15_000 });
        await expect(main).toHaveAttribute('data-screen', 'bracket', { timeout: 15_000 });
        expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
        expect((await (await page.request.get('/api/big')).json()).rotation).toEqual({ screens: ['bracket', 'overview'], seconds: 10 });

        // A screen in the address keeps a second TV on it.
        const second = await screen.newPage();
        await second.goto('/big?screen=stats');
        await expect(second.locator('main')).toHaveAttribute('data-screen', 'stats');
        await second.goto('/big?screen=nope');
        await expect(second.locator('main')).toHaveAttribute('data-screen', /^(bracket|overview)$/);

        // The form refuses no screens.
        await openScreensForm(adminPage);
        for (const type of Object.keys(SCREEN_NAMES) as Screen[]) await adminPage.getByLabel(`Use the ${SCREEN_NAMES[type]} screen`).setChecked(false);
        await adminPage.getByRole('button', { name: 'Save screens' }).click();
        // Scoped to main, since the route announcer of Next is a second, empty alert outside it.
        // Every other alert on the page still counts, so a stray one fails the check.
        await expect(adminPage.getByRole('main').getByRole('alert')).toHaveText('Turn on at least one screen for the big screen.');
        await expect(adminPage.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(1);

        if (shots) {
            await openScreensForm(adminPage);
            await adminPage.locator('#big-screen-rotation').evaluate((el) => el.scrollIntoView({ block: 'start' }));
            await adminPage.screenshot({ path: join(shots, 'admin-screens-1920x1080.png') });
        }
    } finally {
        await saveScreens(adminPage, ['overview'], 60);
        await admin.close();
        await screen.close();
    }
});

test('the other screens show the records and the champion, and never the code without the key', async ({ browser, baseURL }) => {
    test.slow();
    const tag = randomBytes(2).toString('hex');
    const name = `Vinnarcupen ${tag}`;
    const tournamentId = await newTournament(browser, baseURL, name, await bigField(browser, 4), { bestOf: '3' });
    const key = await currentKey(browser, baseURL);
    const screen = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 1920, height: 1080 } });
    const page = await screen.newPage();
    const big = async () => (await page.request.get(`/api/big?t=${tournamentId}`)).json();

    // The semifinals come from the bracket screen data, in bracket order.
    const semis = (await big()).fullBracket.sections[0].rounds[0].matches as { matchId: number; slots: { name: string }[] }[];
    const admin = await adminContext(browser, baseURL);
    const adminPage = await admin.newPage();
    await playMatch(adminPage, semis[0].matchId, [
        [1, 15, 0],
        [1, 15, 7],
    ]);
    await playMatch(adminPage, semis[1].matchId, [
        [1, 15, 11],
        [2, 9, 15],
        [2, 13, 15],
    ]);
    const before = await big();
    expect(before.winner === null || before.winner.tournamentId !== Number(tournamentId)).toBe(true);
    const champion = semis[1].slots[1].name;
    const final = before.fullBracket.sections[0].rounds[1].matches[0].matchId as number;
    await playMatch(adminPage, final, [
        [2, 10, 15],
        [2, 12, 15],
    ]);
    await admin.close();

    await page.goto(`/big?t=${tournamentId}&screen=winner`);
    const winner = page.getByRole('region', { name: 'Vinnaren' });
    await expect(winner).toContainText(`Vinnaren av ${name}`);
    await expect(winner).toContainText(champion);
    await expect(winner).toContainText('0–2');
    await page.goto(`/big?t=${tournamentId}&screen=stats`);
    await expect(page.getByRole('region', { name: 'Rekorda' })).toContainText('Største snuoperasjon');

    const regions: Record<Screen, string[]> = {
        overview: ['Kampen nå', 'Kampoppsett', 'Toppliste', 'Bli med'],
        bracket: ['Heile kampoppsettet'],
        foza: ['Foza-toppen'],
        next: ['Snart i ringen'],
        stats: ['Rekorda'],
        sponsors: ['Sponsorane'],
        winner: ['Vinnaren'],
    };
    for (const type of Object.keys(SCREEN_NAMES) as Screen[]) {
        await page.goto(`/big?t=${tournamentId}&screen=${type}`);
        await expect(page.locator('main')).toHaveAttribute('data-screen', type);
        expect(await page.content()).not.toContain(code);
        await expect(page.getByRole('region', { name: 'Bli med' })).toHaveCount(0);
        await page.goto(`/big?t=${tournamentId}&key=${key}&screen=${type}`);
        await expect(page.locator('main')).toContainText(code);
        await expectFits(page, regions[type]);
        if (shots) {
            // The boards slide in. Without motion the shot shows them in place.
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.screenshot({ path: join(shots, `screen-${type}-1920x1080.png`) });
            await page.emulateMedia({ reducedMotion: null });
        }
    }
    await screen.close();
});
