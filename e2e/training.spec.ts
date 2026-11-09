import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';

// These sign-ups come from their own made-up network, so they do not use up the limit the other tests share.
const network = { 'x-e2e-client': '192.0.2.40' };

async function signUp(browser: Browser, nickname: string) {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, extraHTTPHeaders: network });
    const page = await context.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    return { context, page };
}

const server = { authorization: `Bearer ${process.env.E2E_GAME_SERVER_TOKEN ?? ''}` };

test('a player trains against the bot of the game server, the ring shows it as training, and the result goes to the training stats', async ({ browser }) => {
    const nickname = `Tr${randomBytes(2).toString('hex')}`;
    const { page } = await signUp(browser, nickname);

    await page.goto('/trening');
    const form = page.getByRole('region', { name: 'Tren mot bot' });
    await expect(form.getByLabel('Bot')).toHaveValue('reduced');
    await expect(form.getByLabel('Regla')).toHaveValue('default.lua');
    await form.getByLabel('Bot').selectOption('hyp014');
    await form.getByLabel('Vanskegrad').fill('13');
    await form.getByLabel('Først te').fill('5');
    await form.getByRole('button', { name: 'Start treninga' }).click();
    await expect(page.getByRole('status')).toHaveText('Treninga e klar. Bli med i spelet med lenkjå di.');
    const hero = page.getByRole('region', { name: 'Treninga di e klar' });
    await expect(hero).toContainText(`${nickname} vs Bot (hyp014, vanskegrad 13)`);
    await expect(hero.getByRole('button', { name: 'Kopier lenkjå' })).toBeVisible();

    // One training at a time.
    await expect(form.getByRole('button', { name: 'Start treninga' })).toBeDisabled();

    // The game server gets the training with one player and the bot.
    const sync = await (await page.request.get('/api/server/sync', { headers: server })).json();
    const playerId = sync.players.find((p: { nickname: string }) => p.nickname === nickname).playerId as number;
    const training = sync.matches.find((m: { players: { playerId: number }[]; training?: unknown }) => m.training && m.players[0].playerId === playerId);
    expect(training).toMatchObject({ bestOf: 1, scoreToWin: 5, ruleFile: 'default.lua', training: { bot: 'hyp014', difficulty: 13 } });
    expect(training.players).toHaveLength(1);

    // The ring on the front page shows it as training, after the real matches, with no pool or bet link.
    const connected = await page.request.post(`/api/server/matches/${training.matchId}/connected`, { headers: server, data: { playerIds: [playerId, 0] } });
    expect(await connected.json()).toEqual({ status: 'started' });
    await page.goto('/');
    const ring = page.getByRole('region', { name: 'I ringen nå' });
    const card = ring.locator(`[data-training="${training.matchId}"]`);
    await expect(card).toContainText('TRENING');
    await expect(card).toContainText('LIVE');
    await expect(card).toContainText(`${nickname} vs Bot (hyp014, vanskegrad 13)`);
    await expect(card).toContainText('Vanlig · først te 5');
    await expect(card).not.toContainText('Potten');
    await expect(card.getByRole('link')).toHaveCount(0);
    const cards = ring.locator('article');
    const positions = await cards.evaluateAll((all) => all.map((a) => (a.hasAttribute('data-training') ? 'training' : 'match')));
    expect(positions.indexOf('training')).toBeGreaterThanOrEqual(positions.lastIndexOf('match'));

    // The 1v1 screen of the big screen lists it as training too, after the real 1v1 matches. When
    // those fill every row, it is counted among the ones left out. The screen data is cached for a
    // few seconds, so it is read until it shows up.
    await expect
        .poll(
            async () => {
                const { duels } = await (await page.request.get('/api/big')).json();
                const listed = duels.training.find((t: { trainingId: number }) => t.trainingId === training.matchId);
                if (listed) return listed;
                return duels.live.length + duels.training.length === 4 && duels.liveMore > 0 ? 'left out' : null;
            },
            { timeout: 15_000 },
        )
        .toEqual(expect.anything());
    const { duels } = await (await page.request.get('/api/big')).json();
    const listed = duels.training.find((t: { trainingId: number }) => t.trainingId === training.matchId);
    if (listed) expect(listed).toMatchObject({ nickname, bot: 'hyp014', difficulty: 13, state: 'started' });

    // The bot wins the game.
    const report = await page.request.post('/api/server/games', {
        headers: server,
        data: {
            reportId: randomUUID(),
            matchId: training.matchId,
            game: 1,
            status: 'finished',
            winnerId: 0,
            points: [
                { playerId, points: 2 },
                { playerId: 0, points: 5 },
            ],
            startedAt: '2026-11-20T18:00:00Z',
            endedAt: '2026-11-20T18:02:00Z',
            training: true,
        },
    });
    expect(await report.json()).toEqual({ status: 'stored' });

    await page.goto('/trening');
    await expect(page.getByRole('region', { name: 'Treninga dine' })).toContainText('Spelt 1 · vunne 0 · tapt 1');
    await expect(page.getByRole('region', { name: 'Treninga dine' })).toContainText('Du har ikkje slått någen bot ennå.');
    await expect(page.getByRole('table', { name: 'Kem som tren mest' })).toContainText(nickname);
    await expect(page.getByRole('table', { name: 'Seira mot kvar bot' })).toContainText('hyp014');

    // The front page no longer shows it.
    await page.goto('/');
    await expect(page.locator(`[data-training="${training.matchId}"]`)).toHaveCount(0);
});
