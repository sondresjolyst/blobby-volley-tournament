import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashGameServerToken, type StoredGameServerToken } from '@/lib/store/game-server-token';

const getPool = vi.fn(() => ({}));
const getServerSync = vi.fn();
const updateLiveScore = vi.fn();
const getLiveScore = vi.fn();
const reportPlayersConnected = vi.fn();
const reportServerGame = vi.fn();
const listServerSponsors = vi.fn();
const upgradeGameLogosOnce = vi.fn();
const isTrainingMatch = vi.fn(async () => false);
const reportTrainingConnected = vi.fn();
const reportTrainingGame = vi.fn();

const getStoredGameServerToken = vi.fn();
const markGameServerTokenUsed = vi.fn();

vi.mock('@/lib/db', () => ({ getPool: () => getPool() }));
vi.mock('@/lib/store/game-server-token', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/store/game-server-token')>()),
    getStoredGameServerToken: (...args: unknown[]) => getStoredGameServerToken(...args),
    markGameServerTokenUsed: (...args: unknown[]) => markGameServerTokenUsed(...args),
}));
vi.mock('@/lib/store/game-server', () => ({
    getServerSync: (...args: unknown[]) => getServerSync(...args),
    updateLiveScore: (...args: unknown[]) => updateLiveScore(...args),
    getLiveScore: (...args: unknown[]) => getLiveScore(...args),
}));
vi.mock('@/lib/store/sponsors', () => ({
    listServerSponsors: (...args: unknown[]) => listServerSponsors(...args),
    upgradeGameLogosOnce: (...args: unknown[]) => upgradeGameLogosOnce(...args),
}));
vi.mock('@/lib/store/training', () => ({
    isTrainingMatch: (...args: unknown[]) => isTrainingMatch(...(args as [])),
    reportTrainingConnected: (...args: unknown[]) => reportTrainingConnected(...args),
    reportTrainingGame: (...args: unknown[]) => reportTrainingGame(...args),
}));
vi.mock('@/lib/store/matches', () => ({
    reportPlayersConnected: (...args: unknown[]) => reportPlayersConnected(...args),
    reportServerGame: (...args: unknown[]) => reportServerGame(...args),
}));

import { GET as publicLive } from '../matches/[id]/live/route';
import { POST as games } from './games/route';
import { POST as live } from './live/route';
import { POST as connected } from './matches/[id]/connected/route';
import { GET as sponsors } from './sponsors/route';
import { GET as sync } from './sync/route';
import { encodeBmp32 } from '@/lib/sponsors/bmp';
import { makeGameLogo } from '@/lib/sponsors/logo';

// A placeholder, not a real token.
const TOKEN = 'test-placeholder-token';
const REPORT_ID = '0b6f2f4e-8a51-4d4c-9a0e-5d2b8c3f1a77';
const root = fileURLToPath(new URL('.', import.meta.url));

function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return routeFiles(path);
        return entry.name === 'route.ts' ? [path] : [];
    });
}

const routes = routeFiles(root).map((file) => relative(root, file).replaceAll('\\', '/'));
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const params = (id = '7') => ({ params: Promise.resolve({ id }) });

const request = (path: string, body?: unknown, authorization: string | null = `Bearer ${TOKEN}`) =>
    new Request(`https://bvt.example.test/api/server/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(authorization === null ? {} : { authorization }), 'content-type': 'application/json' },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });

const gameBody = (change: Record<string, unknown> = {}) => ({
    reportId: REPORT_ID,
    matchId: 7,
    game: 2,
    status: 'finished',
    winnerId: 17,
    points: [
        { playerId: 12, points: 11 },
        { playerId: 17, points: 15 },
    ],
    startedAt: '2026-11-20T18:00:00Z',
    endedAt: '2026-11-20T18:05:00Z',
    ...change,
});

const liveBody = { matchId: 7, game: 2, points: [{ playerId: 12, points: 3 }, { playerId: 17, points: 5 }] };

const stored = (lastUsedAt: Date | null = new Date()): StoredGameServerToken => ({ hash: hashGameServerToken(TOKEN), createdAt: new Date('2026-11-20T12:00:00Z'), lastUsedAt });
const STORES = [getServerSync, updateLiveScore, getLiveScore, reportPlayersConnected, reportServerGame, listServerSponsors, upgradeGameLogosOnce, isTrainingMatch, reportTrainingConnected, reportTrainingGame];

// The modules are loaded once before the tests. A first load with a cold transform cache can take
// longer than the timeout of a single test, and a test that timed out keeps running into the next one.
const modules = new Map<string, unknown>();
beforeAll(async () => {
    for (const file of routes) modules.set(file, await import(/* @vite-ignore */ `./${file}`));
}, 120_000);

beforeEach(() => {
    for (const mock of [getPool, getStoredGameServerToken, markGameServerTokenUsed, ...STORES]) mock.mockClear();
    getStoredGameServerToken.mockReset();
    getStoredGameServerToken.mockResolvedValue(stored());
});

describe('every /api/server route', () => {
    it('is found', () => {
        expect(routes.sort()).toEqual(['games/route.ts', 'live/route.ts', 'matches/[id]/connected/route.ts', 'sponsors/route.ts', 'sync/route.ts']);
    });

    it.each(routes)('%s checks the token before it does anything else', async (route) => {
        const mod = modules.get(route) as Record<string, unknown>;
        const handlers = METHODS.filter((method) => typeof mod[method] === 'function');
        expect(handlers.length).toBeGreaterThan(0);
        for (const method of handlers) {
            const handler = mod[method] as (req: Request, ctx: unknown) => Promise<Response>;
            const call = (authorization: string | null) =>
                handler(new Request('https://bvt.example.test/api/server/x', { method, headers: authorization === null ? {} : { authorization }, body: method === 'GET' ? undefined : '{}' }), params());

            for (const authorization of [null, 'Bearer test-placeholder-other', `Bearer ${TOKEN}-`, TOKEN]) {
                const res = await call(authorization);
                expect(res.status).toBe(401);
                expect(await res.json()).toEqual({ error: 'unauthorized' });
            }

            getStoredGameServerToken.mockResolvedValueOnce(null);
            const unset = await call(`Bearer ${TOKEN}`);
            expect(unset.status).toBe(503);
            expect(await unset.json()).toEqual({ error: 'not-configured' });
        }
        for (const mock of STORES) expect(mock).not.toHaveBeenCalled();
        expect(markGameServerTokenUsed).not.toHaveBeenCalled();
    });
});

describe('the last use of the token', () => {
    it('is passed to the store on each accepted call, which only writes when it is old enough', async () => {
        getServerSync.mockResolvedValue({});
        getStoredGameServerToken.mockResolvedValueOnce(stored(new Date()));
        expect((await sync(request('sync'))).status).toBe(200);
        getStoredGameServerToken.mockResolvedValueOnce(stored(null));
        expect((await sync(request('sync'))).status).toBe(200);
        expect(markGameServerTokenUsed).toHaveBeenCalledTimes(2);
        expect(markGameServerTokenUsed).toHaveBeenCalledWith({}, hashGameServerToken(TOKEN));
    });

    it('is not written for a refused call', async () => {
        getStoredGameServerToken.mockResolvedValueOnce(stored(null));
        expect((await sync(request('sync', undefined, 'Bearer test-placeholder-other'))).status).toBe(401);
        expect(markGameServerTokenUsed).not.toHaveBeenCalled();
    });
});

describe('GET /api/server/sync', () => {
    it('answers with the sync and no caching, with the series score of each match', async () => {
        const body = {
            serverTime: '2026-11-20T18:00:00.000Z',
            syncVersion: 'abc',
            eventId: 1,
            players: [],
            matches: [
                {
                    matchId: 7,
                    state: 'started',
                    bestOf: 3,
                    nextGame: 3,
                    ruleFile: 'default.lua',
                    scoreToWin: 15,
                    speed: 75,
                    awaitingDecision: false,
                    wins1: 1,
                    wins2: 1,
                    players: [
                        { playerId: 12, code: 'K7QM2XPR4T' },
                        { playerId: 17, code: 'B9HNZ3WD6F' },
                    ],
                },
            ],
        };
        getServerSync.mockResolvedValue(body);
        const res = await sync(request('sync'));
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(await res.json()).toEqual(body);
        expect(getServerSync).toHaveBeenCalledWith({}, expect.any(Date));
    });
});

describe('GET /api/server/sponsors', () => {
    const bmp = encodeBmp32(new Uint8Array(96 * 32 * 4).fill(255), 96, 32);

    it('answers the sponsors in order with each game logo as base64 and its hash', async () => {
        listServerSponsors.mockResolvedValue({
            eventId: 1,
            gameBoard: 'led',
            sponsors: [
                { sponsorId: 4, name: 'Acme', gameLogo: bmp, gameLogoHash: 'a'.repeat(64) },
                { sponsorId: 2, name: 'Beta', gameLogo: bmp, gameLogoHash: 'b'.repeat(64) },
            ],
        });
        const res = await sponsors(request('sponsors'));
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const body = await res.json();
        expect(body).toEqual({
            eventId: 1,
            gameBoard: 'led',
            sponsorsVersion: expect.stringMatching(/^[0-9a-f]{16}$/),
            sponsors: [
                { sponsorId: 4, name: 'Acme', logo: { format: 'bmp', width: 96, height: 32, bitsPerPixel: 32, hash: 'a'.repeat(64), data: expect.any(String) } },
                { sponsorId: 2, name: 'Beta', logo: { format: 'bmp', width: 96, height: 32, bitsPerPixel: 32, hash: 'b'.repeat(64), data: expect.any(String) } },
            ],
        });
        expect(new Uint8Array(Buffer.from(body.sponsors[0].logo.data, 'base64'))).toEqual(bmp);
        expect(listServerSponsors).toHaveBeenCalledWith({});
        // Old 24-bit game logos are made again before the list is read.
        expect(upgradeGameLogosOnce).toHaveBeenCalledWith({}, makeGameLogo);
        expect(upgradeGameLogosOnce.mock.invocationCallOrder[0]).toBeLessThan(listServerSponsors.mock.invocationCallOrder[0]);
    });

    it('keeps the version while nothing changes and changes it with a logo', async () => {
        const answer = (hash: string) => ({ eventId: 1, gameBoard: 'led', sponsors: [{ sponsorId: 4, name: 'Acme', gameLogo: bmp, gameLogoHash: hash }] });
        const version = async () => (await (await sponsors(request('sponsors'))).json()).sponsorsVersion;
        listServerSponsors.mockResolvedValue(answer('a'.repeat(64)));
        const first = await version();
        expect(await version()).toBe(first);
        listServerSponsors.mockResolvedValue(answer('c'.repeat(64)));
        expect(await version()).not.toBe(first);
    });

    it('changes the version with the board style, even with no sponsors', async () => {
        const version = async () => (await (await sponsors(request('sponsors'))).json()).sponsorsVersion;
        const seen = new Set<string>();
        for (const gameBoard of ['off', 'led', 'wood']) {
            listServerSponsors.mockResolvedValue({ eventId: 1, gameBoard, sponsors: [] });
            seen.add(await version());
        }
        expect(seen.size).toBe(3);
    });

    it('answers the board as off and an empty list when the board is off or no event is active', async () => {
        listServerSponsors.mockResolvedValue({ eventId: 1, gameBoard: 'off', sponsors: [] });
        expect(await (await sponsors(request('sponsors'))).json()).toMatchObject({ eventId: 1, gameBoard: 'off', sponsors: [] });
        listServerSponsors.mockResolvedValue({ eventId: null, gameBoard: 'off', sponsors: [] });
        expect(await (await sponsors(request('sponsors'))).json()).toMatchObject({ eventId: null, gameBoard: 'off', sponsors: [] });
    });
});

describe('POST /api/server/matches/{id}/connected', () => {
    const post = (body: unknown, id = '7') => connected(request(`matches/${id}/connected`, body), params(id));

    it('starts the match and says so, and says when it had started already', async () => {
        reportPlayersConnected.mockResolvedValueOnce({ ok: true, events: [], started: true }).mockResolvedValueOnce({ ok: true, events: [], started: false });
        expect(await (await post({ playerIds: [12, 17] })).json()).toEqual({ status: 'started' });
        expect(reportPlayersConnected).toHaveBeenCalledWith({}, 7, [12, 17]);
        expect(await (await post({ playerIds: [17, 12] })).json()).toEqual({ status: 'already-started' });
    });

    it('answers a refusal with its reason', async () => {
        for (const reason of ['state', 'players']) {
            reportPlayersConnected.mockResolvedValueOnce({ ok: false, error: reason });
            const res = await post({ playerIds: [12, 17] });
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ status: 'refused', reason });
        }
    });

    it('answers an unknown match with 200 and refused not-found, like the other routes', async () => {
        reportPlayersConnected.mockResolvedValueOnce({ ok: false, error: 'not-found' });
        const unknown = await post({ playerIds: [12, 17] });
        expect(unknown.status).toBe(200);
        expect(await unknown.json()).toEqual({ status: 'refused', reason: 'not-found' });
    });

    it('answers 400 JSON for an id that is not a match id', async () => {
        for (const id of ['x', '0', '-1', '99999999999']) {
            const res = await post({ playerIds: [12, 17] }, id);
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ error: 'invalid', field: 'id' });
        }
        expect(reportPlayersConnected).not.toHaveBeenCalled();
    });

    it('answers 400 JSON for a bad body without touching the match', async () => {
        for (const body of ['not json', {}, { playerIds: [12] }, { playerIds: [12, 12] }]) {
            const res = await post(body);
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ error: 'invalid', field: expect.any(String) });
        }
        expect(reportPlayersConnected).not.toHaveBeenCalled();
    });
});

describe('training against the bot of the game server', () => {
    const postGame = (body: unknown) => games(request('games', body));
    const postConnected = (body: unknown, id = '40') => connected(request(`matches/${id}/connected`, body), params(id));
    const trainingBody = (change: Record<string, unknown> = {}) =>
        gameBody({ matchId: 40, game: 1, training: true, winnerId: 0, points: [{ playerId: 12, points: 4 }, { playerId: 0, points: 15 }], ...change });

    it('sends a training game to the training store, never to the matches', async () => {
        reportTrainingGame.mockResolvedValueOnce({ status: 'stored' });
        const res = await postGame(trainingBody());
        expect(await res.json()).toEqual({ status: 'stored' });
        expect(reportTrainingGame).toHaveBeenCalledWith({}, expect.objectContaining({ matchId: 40, winnerId: 0, status: 'finished' }));
        expect(reportServerGame).not.toHaveBeenCalled();
    });

    it('answers 400 for a training game with two players', async () => {
        const res = await postGame(trainingBody({ points: [{ playerId: 12, points: 4 }, { playerId: 17, points: 15 }], winnerId: 17 }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'invalid', field: 'points' });
        expect(reportTrainingGame).not.toHaveBeenCalled();
    });

    it('starts a training match with the player and the bot', async () => {
        isTrainingMatch.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
        reportTrainingConnected.mockResolvedValueOnce({ ok: true, started: true }).mockResolvedValueOnce({ ok: false, error: 'players' });
        expect(await (await postConnected({ playerIds: [12, 0] })).json()).toEqual({ status: 'started' });
        expect(reportTrainingConnected).toHaveBeenCalledWith({}, 40, [12, 0]);
        expect(await (await postConnected({ playerIds: [17, 0] })).json()).toEqual({ status: 'refused', reason: 'players' });
        expect(reportPlayersConnected).not.toHaveBeenCalled();
    });

    it('answers 400 when a training match is not reported with the bot', async () => {
        isTrainingMatch.mockResolvedValueOnce(true);
        const res = await postConnected({ playerIds: [12, 17] });
        expect(res.status).toBe(400);
        expect(reportTrainingConnected).not.toHaveBeenCalled();
    });
});

describe('POST /api/server/games', () => {
    const post = (body: unknown) => games(request('games', body));

    it('passes the report on with the winner by player id', async () => {
        reportServerGame.mockResolvedValue({ ok: true, events: [], status: 'applied' });
        const res = await post(gameBody({ reportId: REPORT_ID.toUpperCase() }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'stored' });
        expect(reportServerGame).toHaveBeenCalledWith(
            {},
            {
                reportId: REPORT_ID,
                matchId: 7,
                game: 2,
                winnerId: 17,
                leftPlayerId: null,
                points: [
                    { playerId: 12, points: 11 },
                    { playerId: 17, points: 15 },
                ],
                startedAt: new Date('2026-11-20T18:00:00Z'),
                endedAt: new Date('2026-11-20T18:05:00Z'),
            },
        );
    });

    it('passes an abandoned game on with no winner', async () => {
        reportServerGame.mockResolvedValue({ ok: true, events: [], status: 'applied' });
        await post(gameBody({ status: 'abandoned', winnerId: null }));
        expect(reportServerGame).toHaveBeenCalledWith({}, expect.objectContaining({ winnerId: null, leftPlayerId: null }));
    });

    it('passes on the player who left an abandoned game', async () => {
        reportServerGame.mockResolvedValue({ ok: true, events: [], status: 'applied' });
        await post(gameBody({ status: 'abandoned', winnerId: null, leftPlayerId: 12 }));
        expect(reportServerGame).toHaveBeenCalledWith({}, expect.objectContaining({ winnerId: null, leftPlayerId: 12 }));
    });

    it('refuses a finished game that names a player who left', async () => {
        const res = await post(gameBody({ leftPlayerId: 12 }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'invalid', field: 'leftPlayerId' });
        expect(reportServerGame).not.toHaveBeenCalled();
    });

    it.each([
        [{ ok: true, events: [], status: 'applied' }, { status: 'stored' }],
        [{ ok: true, events: [], status: 'duplicate' }, { status: 'duplicate' }],
        [{ ok: true, events: [], status: 'ignored', reason: 'game-closed' }, { status: 'game-closed' }],
        [{ ok: true, events: [], status: 'ignored', reason: 'state' }, { status: 'refused', reason: 'state' }],
        [{ ok: true, events: [], status: 'ignored', reason: 'game-ahead' }, { status: 'refused', reason: 'game-ahead' }],
        [{ ok: false, error: 'not-found' }, { status: 'refused', reason: 'not-found' }],
        [{ ok: false, error: 'players' }, { status: 'refused', reason: 'players' }],
        [{ ok: false, error: 'score' }, { status: 'refused', reason: 'score' }],
    ])('answers %j as %j', async (result, answer) => {
        reportServerGame.mockResolvedValue(result);
        const res = await post(gameBody());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(answer);
    });

    it.each([
        ['body', 'not json'],
        ['body', [1, 2]],
        ['reportId', gameBody({ reportId: 'r-1' })],
        ['matchId', gameBody({ matchId: 'seven' })],
        ['game', gameBody({ game: 0 })],
        ['status', gameBody({ status: 'won' })],
        ['winnerId', gameBody({ winnerId: 99 })],
        ['points', gameBody({ winnerId: 12 })],
        ['startedAt', gameBody({ startedAt: 'now' })],
        ['endedAt', gameBody({ endedAt: '2026-11-20T17:00:00Z' })],
    ])('answers 400 JSON naming %s for a bad report', async (field, body) => {
        const res = await post(body);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'invalid', field });
        expect(reportServerGame).not.toHaveBeenCalled();
    });
});

describe('POST /api/server/live', () => {
    it('stores the score and answers what happened', async () => {
        updateLiveScore.mockResolvedValueOnce({ status: 'stored' }).mockResolvedValueOnce({ status: 'ignored', reason: 'game-closed' });
        expect(await (await live(request('live', liveBody))).json()).toEqual({ status: 'stored' });
        expect(updateLiveScore).toHaveBeenCalledWith({}, liveBody, expect.any(Date));
        expect(await (await live(request('live', liveBody))).json()).toEqual({ status: 'ignored', reason: 'game-closed' });
    });

    it('answers 400 JSON for a bad body', async () => {
        const res = await live(request('live', { ...liveBody, points: [] }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'invalid', field: 'points' });
        expect(updateLiveScore).not.toHaveBeenCalled();
    });
});

describe('GET /api/matches/{id}/live', () => {
    it('is public and answers the live score with no caching', async () => {
        getStoredGameServerToken.mockResolvedValue(null);
        const score = { matchId: 7, state: 'started', live: null };
        getLiveScore.mockResolvedValue(score);
        const res = await publicLive(new Request('https://bvt.example.test/api/matches/7/live'), params());
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(await res.json()).toEqual(score);
        expect(getLiveScore).toHaveBeenCalledWith({}, 7);
    });

    it('answers 404 for an unknown match or a bad id', async () => {
        getLiveScore.mockResolvedValue(null);
        expect((await publicLive(new Request('https://bvt.example.test/api/matches/7/live'), params())).status).toBe(404);
        expect((await publicLive(new Request('https://bvt.example.test/api/matches/x/live'), params('x'))).status).toBe(404);
        expect(getLiveScore).toHaveBeenCalledTimes(1);
    });
});
