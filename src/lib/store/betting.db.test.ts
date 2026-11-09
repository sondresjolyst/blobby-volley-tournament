import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS_DIR, readMigrations } from '../../../scripts/migrate.mjs';
import { generateBracket, type BestOf } from '@/lib/bracket';
import type { EventInput } from '@/lib/events/input';
import { newJoinCode } from '@/lib/players/join-code';
import { getMatchPool, listMatchPools, listPlayerBets, placeBet } from './bets';
import { createEvent, setActiveEvent, updateEvent, clearActiveEvent } from './events';
import { addLedger, adjustBalance, getBalance, getFozaSummary, getWallet, listFozaSummaries, listLedger } from './foza';
import {
    acceptChallenge,
    callMatch,
    cancelMatch,
    createChallenge,
    enterGameResult,
    getMatch,
    listMatches,
    recordNoShow,
    reportGameResult,
    reportPlayersConnected,
    resetMatch,
    setSeriesScore,
    withdrawChallenge,
} from './matches';
import { signUpPlayer } from './players';
import { saveTournament } from './tournaments';
import { inTransaction } from './transaction';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };

/** Players in these tests sign up at this time, and bets are placed later the same Oslo day, so no daily Foza is paid unless a test asks for it. */
const SIGNED_UP = new Date('2026-11-20T09:00:00Z');
const NOW = new Date('2026-11-20T12:00:00Z');

let counter = 0;
const nextId = () => `r-${++counter}`;

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

/** After every test, each balance equals the sum of its ledger. */
afterEach(async () => {
    const { rows } = await pool.query<{ id: number; balance: number; total: string }>(
        `SELECT p.id, p.foza_balance AS balance, coalesce((SELECT sum(amount) FROM foza_ledger l WHERE l.player_id = p.id), 0) AS total FROM players p`,
    );
    for (const row of rows) expect({ id: row.id, balance: row.balance }).toEqual({ id: row.id, balance: Number(row.total) });
});

afterAll(async () => {
    await pool.end();
});

async function addPlayer(eventId: number, nickname: string, starting = 1000, signedUp = SIGNED_UP): Promise<number> {
    return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, created_at, join_code)
             VALUES ($1, $2, $3, '\\x00', '\\x00', 0, $4, $5) RETURNING id`,
            [eventId, nickname, nickname.toLowerCase(), signedUp, newJoinCode()],
        );
        await addLedger(client, [{ playerId: rows[0].id, type: 'starting', amount: starting }]);
        return rows[0].id;
    });
}

/** An active event with players A, B, C and D, who play, and bettors X, Y and Z. */
async function setup(input: EventInput = lan) {
    const eventId = await createEvent(pool, input);
    await setActiveEvent(pool, eventId);
    const ids: Record<string, number> = {};
    for (const name of ['A', 'B', 'C', 'D', 'X', 'Y', 'Z']) ids[name] = await addPlayer(eventId, name, input.startingFoza);
    return { eventId, ...ids } as { eventId: number } & Record<'A' | 'B' | 'C' | 'D' | 'X' | 'Y' | 'Z', number>;
}

/** Saves a single elimination tournament seeded in the given order. Returns its runtime match ids in play order. */
async function tournament(eventId: number, players: number[], bestOf: BestOf = 1): Promise<number[]> {
    const options = { format: 'single_elimination' as const, players, seeding: { method: 'manual' as const, order: players }, thirdPlaceMatch: false };
    const planned = generateBracket(options);
    const bracket = generateBracket({ ...options, rounds: Object.fromEntries(planned.rounds.map((r) => [r.key, { bestOf }])) });
    const saved = await saveTournament(pool, eventId, { name: `Cup ${nextId()}`, seeding: 'manual', randomSeed: null, bracket });
    if (!saved.ok) throw new Error(saved.error);
    const matches = (await listMatches(pool, eventId)).filter((m) => m.tournamentId === saved.id);
    return matches.map((m) => m.id);
}

/** An accepted 1v1 match. Accepting calls it when both players are free. */
async function oneVsOne(a: number, b: number): Promise<number> {
    const created = await createChallenge(pool, a, b, { bestOf: 1 });
    if (!created.ok) throw new Error(created.error);
    expect(await acceptChallenge(pool, created.matchId, b)).toMatchObject({ ok: true });
    return created.matchId;
}

const bet = (playerId: number, matchId: number, onPlayerId: number, amount: number, now = NOW) => placeBet(pool, playerId, { matchId, onPlayerId, amount }, now);

const report = (matchId: number, game: number, winnerSlot: 1 | 2) =>
    reportGameResult(pool, { reportId: nextId(), matchId, game, winnerSlot, points1: winnerSlot === 1 ? 15 : 7, points2: winnerSlot === 2 ? 15 : 7 });

async function start(matchId: number) {
    // An accepted 1v1 match is called when it is accepted, so only a tournament match is called here.
    if ((await getMatch(pool, matchId))!.state === 'upcoming') expect(await callMatch(pool, matchId)).toMatchObject({ ok: true });
    expect(await reportPlayersConnected(pool, matchId)).toMatchObject({ ok: true, started: true });
}

/** Plays a started match until the slot has won the series. */
async function playTo(matchId: number, slot: 1 | 2) {
    for (let i = 0; i < 7; i++) {
        const match = (await getMatch(pool, matchId))!;
        if (match.state === 'finished') return;
        expect(await report(matchId, match.nextGame, slot)).toMatchObject({ ok: true, status: 'applied' });
    }
}

const balance = async (playerId: number) => (await pool.query<{ foza_balance: number }>('SELECT foza_balance FROM players WHERE id = $1', [playerId])).rows[0].foza_balance;
const balances = async (ids: Record<string, number>) => Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, await balance(id)] as const)));
const statuses = async (matchId: number) =>
    (await pool.query<{ player_id: number; status: string; amount: number; payout: number }>('SELECT player_id, status, amount, payout FROM bets WHERE match_id = $1 ORDER BY id', [matchId])).rows;
const ledgerTypes = async (playerId: number) => (await listLedger(pool, playerId)).map((r) => [r.type, r.amount]);

/** Waits until this many other connections wait on a lock. */
async function waitForLockWaiters(count: number) {
    for (let i = 0; i < 100; i++) {
        const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`);
        if (rows[0].n >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`fewer than ${count} connections wait on a lock`);
}

describe('placing a bet', () => {
    it('is open while a match is upcoming or called and closed once it starts or ends', async () => {
        const s = await setup();
        const [semi1, semi2, final] = await tournament(s.eventId, [s.A, s.B, s.C, s.D]);
        expect(await bet(s.X, semi1, s.A, 10)).toMatchObject({ ok: true, raised: false });
        // The final has no players yet.
        expect(await bet(s.X, final, s.A, 10)).toEqual({ ok: false, error: 'closed' });
        await callMatch(pool, semi1);
        expect(await bet(s.Y, semi1, s.D, 10)).toMatchObject({ ok: true });
        await reportPlayersConnected(pool, semi1);
        expect(await bet(s.Z, semi1, s.A, 10)).toEqual({ ok: false, error: 'closed' });
        await playTo(semi1, 1);
        expect(await bet(s.Z, semi1, s.A, 10)).toEqual({ ok: false, error: 'closed' });
        await recordNoShow(pool, semi2, 2);
        expect(await bet(s.Z, semi2, s.C, 10)).toEqual({ ok: false, error: 'closed' });
        // Both finalists are known now.
        expect(await bet(s.Z, final, s.A, 10)).toMatchObject({ ok: true });
        expect(await bet(s.Z, 999_999, s.A, 10)).toEqual({ ok: false, error: 'not-found' });
    });

    it('is closed for an unaccepted or cancelled 1v1 match', async () => {
        const s = await setup();
        const created = await createChallenge(pool, s.A, s.B);
        if (!created.ok) throw new Error(created.error);
        expect(await bet(s.X, created.matchId, s.A, 10)).toEqual({ ok: false, error: 'closed' });
        await acceptChallenge(pool, created.matchId, s.B);
        expect(await bet(s.X, created.matchId, s.A, 10)).toMatchObject({ ok: true });
        await cancelMatch(pool, created.matchId);
        expect(await bet(s.Y, created.matchId, s.A, 10)).toEqual({ ok: false, error: 'closed' });
    });

    it('is open from the accept until both players connect, also while the accepted match waits for a busy player', async () => {
        const s = await setup();
        const busy = await oneVsOne(s.A, s.B);
        expect(await getMatch(pool, busy)).toMatchObject({ state: 'called' });
        expect(await bet(s.X, busy, s.A, 10)).toMatchObject({ ok: true });
        await reportPlayersConnected(pool, busy);
        expect(await bet(s.Y, busy, s.A, 10)).toEqual({ ok: false, error: 'closed' });

        const created = await createChallenge(pool, s.A, s.C);
        if (!created.ok) throw new Error(created.error);
        expect(await acceptChallenge(pool, created.matchId, s.C)).toMatchObject({ ok: true, called: false });
        expect(await bet(s.X, created.matchId, s.C, 10)).toMatchObject({ ok: true });
        await playTo(busy, 1);
        expect(await getMatch(pool, created.matchId)).toMatchObject({ state: 'called' });
        expect(await bet(s.Y, created.matchId, s.A, 10)).toMatchObject({ ok: true });
        await reportPlayersConnected(pool, created.matchId);
        expect(await bet(s.Z, created.matchId, s.A, 10)).toEqual({ ok: false, error: 'closed' });
    });

    it('takes no bet before a 1v1 match is accepted, so a withdraw has nothing to refund', async () => {
        const s = await setup();
        const created = await createChallenge(pool, s.A, s.B);
        if (!created.ok) throw new Error(created.error);
        expect(await bet(s.X, created.matchId, s.A, 10)).toEqual({ ok: false, error: 'closed' });
        expect(await bet(s.A, created.matchId, s.A, 10)).toEqual({ ok: false, error: 'closed' });
        expect(await withdrawChallenge(pool, created.matchId, s.A)).toMatchObject({ ok: true });
        expect(await statuses(created.matchId)).toEqual([]);
        expect(await ledgerTypes(s.X)).toEqual([['starting', 1000]]);
        expect(await bet(s.X, created.matchId, s.A, 10)).toEqual({ ok: false, error: 'closed' });
    });

    it('lets a player raise a bet but not move it to the other side', async () => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        expect(await bet(s.X, id, s.A, 100)).toMatchObject({ ok: true, stake: 100, balance: 900, raised: false });
        expect(await bet(s.X, id, s.A, 50)).toMatchObject({ ok: true, stake: 150, balance: 850, raised: true });
        expect(await bet(s.X, id, s.B, 10)).toEqual({ ok: false, error: 'switch' });
        expect(await statuses(id)).toEqual([{ player_id: s.X, status: 'open', amount: 150, payout: 0 }]);
        expect(await ledgerTypes(s.X)).toEqual([
            ['starting', 1000],
            ['bet', -100],
            ['bet', -50],
        ]);
        expect(await balance(s.X)).toBe(850);
    });

    it('allows the whole balance and refuses more', async () => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        expect(await bet(s.X, id, s.A, 1001)).toEqual({ ok: false, error: 'balance' });
        expect(await bet(s.X, id, s.A, 1000)).toMatchObject({ ok: true, balance: 0 });
        expect(await bet(s.X, id, s.A, 1)).toEqual({ ok: false, error: 'balance' });
        expect(await bet(s.Y, id, s.A, 0)).toEqual({ ok: false, error: 'amount' });
        expect(await bet(s.Y, id, s.A, 2.5)).toEqual({ ok: false, error: 'amount' });
        expect(await balance(s.X)).toBe(0);
        expect(await balance(s.Y)).toBe(1000);
    });

    it('lets players bet on their own match, on either side', async () => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        expect(await bet(s.A, id, s.A, 10)).toMatchObject({ ok: true });
        expect(await bet(s.B, id, s.A, 10)).toMatchObject({ ok: true });
    });

    it('refuses a player who is not in the match or a bettor from another event', async () => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        expect(await bet(s.X, id, s.C, 10)).toEqual({ ok: false, error: 'side' });
        const other = await createEvent(pool, { ...lan, name: 'Other', code: 'OTHER-1' });
        const outsider = await addPlayer(other, 'Out');
        expect(await bet(outsider, id, s.A, 10)).toEqual({ ok: false, error: 'event' });
    });
});

describe('settlement', () => {
    it('pays a best of 1 from the pool when the match ends', async () => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        await bet(s.X, id, s.A, 100);
        await bet(s.Z, id, s.A, 100);
        await bet(s.Y, id, s.B, 300);
        await start(id);
        await playTo(id, 1);
        // Pool 500, 200 on A: each A bettor gets 100 * 500 / 200 = 250.
        expect(await balances({ X: s.X, Y: s.Y, Z: s.Z })).toEqual({ X: 1150, Y: 700, Z: 1150 });
        expect(await statuses(id)).toEqual([
            { player_id: s.X, status: 'won', amount: 100, payout: 250 },
            { player_id: s.Z, status: 'won', amount: 100, payout: 250 },
            { player_id: s.Y, status: 'lost', amount: 300, payout: 0 },
        ]);
        expect(await ledgerTypes(s.X)).toEqual([
            ['starting', 1000],
            ['bet', -100],
            ['payout', 250],
        ]);
    });

    it('settles a best of 3 on the whole match, not on single games, and rounds down', async () => {
        const s = await setup();
        const [id] = await tournament(s.eventId, [s.A, s.B], 3);
        await bet(s.X, id, s.B, 1);
        await bet(s.Y, id, s.B, 2);
        await bet(s.Z, id, s.A, 7);
        await start(id);
        expect(await report(id, 1, 1)).toMatchObject({ ok: true });
        expect((await statuses(id)).map((b) => b.status)).toEqual(['open', 'open', 'open']);
        expect(await report(id, 2, 2)).toMatchObject({ ok: true });
        expect((await statuses(id)).map((b) => b.status)).toEqual(['open', 'open', 'open']);
        expect(await report(id, 3, 2)).toMatchObject({ ok: true });
        // Pool 10, 3 on B: 1 * 10 / 3 = 3 and 2 * 10 / 3 = 6. The last Foza is discarded.
        expect(await statuses(id)).toEqual([
            { player_id: s.X, status: 'won', amount: 1, payout: 3 },
            { player_id: s.Y, status: 'won', amount: 2, payout: 6 },
            { player_id: s.Z, status: 'lost', amount: 7, payout: 0 },
        ]);
        expect(await balances({ X: s.X, Y: s.Y, Z: s.Z })).toEqual({ X: 1002, Y: 1004, Z: 993 });
    });

    it('returns every stake when nobody bet on the winner', async () => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        await bet(s.X, id, s.A, 100);
        await bet(s.Y, id, s.A, 50);
        await start(id);
        await playTo(id, 2);
        expect(await balances({ X: s.X, Y: s.Y })).toEqual({ X: 1000, Y: 1000 });
        expect((await statuses(id)).map((b) => b.status)).toEqual(['returned', 'returned']);
    });

    it.each([
        ['a no-show before the start', async (id: number) => recordNoShow(pool, id, 1)],
        [
            'a no-show after the start',
            async (id: number) => {
                await start(id);
                return recordNoShow(pool, id, 2);
            },
        ],
        ['a cancel', async (id: number) => cancelMatch(pool, id)],
        [
            'a reset of a called match',
            async (id: number) => {
                await callMatch(pool, id);
                return resetMatch(pool, id);
            },
        ],
    ])('refunds every bet on %s', async (_name, end) => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        await bet(s.X, id, s.A, 100);
        await bet(s.Y, id, s.B, 300);
        expect(await end(id)).toMatchObject({ ok: true });
        expect(await balances({ X: s.X, Y: s.Y })).toEqual({ X: 1000, Y: 1000 });
        expect((await statuses(id)).map((b) => b.status)).toEqual(['refunded', 'refunded']);
        expect((await ledgerTypes(s.X)).at(-1)).toEqual(['refund', 100]);
    });

    it('reverses the payouts and refunds the stakes when a played match is reset, and takes new bets after', async () => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        await bet(s.X, id, s.A, 100);
        await bet(s.Y, id, s.B, 300);
        await start(id);
        await playTo(id, 1);
        expect(await balances({ X: s.X, Y: s.Y })).toEqual({ X: 1300, Y: 700 });
        expect(await resetMatch(pool, id)).toMatchObject({ ok: true });
        expect(await balances({ X: s.X, Y: s.Y })).toEqual({ X: 1000, Y: 1000 });
        expect(await ledgerTypes(s.X)).toEqual([
            ['starting', 1000],
            ['bet', -100],
            ['payout', 400],
            ['reversal', -400],
            ['refund', 100],
        ]);
        expect(await ledgerTypes(s.Y)).toEqual([
            ['starting', 1000],
            ['bet', -300],
            ['refund', 300],
        ]);
        // The match is upcoming again, so a new bet can be placed, even on the other side.
        expect(await bet(s.X, id, s.B, 20)).toMatchObject({ ok: true, raised: false, stake: 20 });
    });

    it('does not refund twice when a forfeited match is reset', async () => {
        const s = await setup();
        const id = await oneVsOne(s.A, s.B);
        await bet(s.X, id, s.A, 100);
        await recordNoShow(pool, id, 2);
        expect(await resetMatch(pool, id)).toMatchObject({ ok: true });
        expect(await balance(s.X)).toBe(1000);
        expect(await ledgerTypes(s.X)).toEqual([
            ['starting', 1000],
            ['bet', -100],
            ['refund', 100],
        ]);
    });

    it('reverses and redoes the settlement when a correction changes the winner', async () => {
        const s = await setup();
        const [id] = await tournament(s.eventId, [s.A, s.B], 1);
        await bet(s.X, id, s.A, 100);
        await bet(s.Y, id, s.B, 100);
        await bet(s.Z, id, s.B, 300);
        await start(id);
        await playTo(id, 1);
        expect(await balances({ X: s.X, Y: s.Y, Z: s.Z })).toEqual({ X: 1400, Y: 900, Z: 700 });
        expect(await enterGameResult(pool, id, { game: 1, winnerSlot: 2, points1: 3, points2: 15 })).toMatchObject({ ok: true });
        // Pool 500, 400 on B: 100 * 500 / 400 = 125 and 300 * 500 / 400 = 375.
        expect(await balances({ X: s.X, Y: s.Y, Z: s.Z })).toEqual({ X: 900, Y: 1025, Z: 1075 });
        expect(await ledgerTypes(s.X)).toEqual([
            ['starting', 1000],
            ['bet', -100],
            ['payout', 500],
            ['reversal', -500],
        ]);
        expect((await statuses(id)).map((b) => [b.status, b.payout])).toEqual([
            ['lost', 0],
            ['won', 125],
            ['won', 375],
        ]);
    });

    it('opens the bets again when a correction leaves the match undecided, and settles them on the new result', async () => {
        const s = await setup();
        const [id] = await tournament(s.eventId, [s.A, s.B], 3);
        await bet(s.X, id, s.A, 100);
        await bet(s.Y, id, s.B, 100);
        await start(id);
        await playTo(id, 1);
        expect(await balances({ X: s.X, Y: s.Y })).toEqual({ X: 1100, Y: 900 });
        expect(await setSeriesScore(pool, id, 1, 1)).toMatchObject({ ok: true });
        expect((await statuses(id)).map((b) => b.status)).toEqual(['open', 'open']);
        expect(await balances({ X: s.X, Y: s.Y })).toEqual({ X: 900, Y: 900 });
        // Bets stay closed while the match is decided again.
        expect(await bet(s.Z, id, s.A, 10)).toEqual({ ok: false, error: 'closed' });
        await playTo(id, 2);
        expect(await balances({ X: s.X, Y: s.Y })).toEqual({ X: 900, Y: 1100 });
    });

    it('lets a reversal take a balance below 0 when the payout was spent', async () => {
        const s = await setup();
        const first = await oneVsOne(s.A, s.B);
        const second = await oneVsOne(s.C, s.D);
        await bet(s.X, first, s.A, 1000);
        await bet(s.Y, first, s.B, 1000);
        await start(first);
        await playTo(first, 1);
        expect(await balance(s.X)).toBe(2000);
        expect(await bet(s.X, second, s.C, 2000)).toMatchObject({ ok: true, balance: 0 });
        expect(await resetMatch(pool, first)).toMatchObject({ ok: true });
        // 0 - 2000 payout + 1000 stake back.
        expect(await balance(s.X)).toBe(-1000);
        expect(await bet(s.X, first, s.A, 1)).toEqual({ ok: false, error: 'balance' });
    });

    it('refunds bets on a later match when a correction changes its players', async () => {
        const s = await setup();
        const [semi1, semi2, final] = await tournament(s.eventId, [s.A, s.B, s.C, s.D]);
        await start(semi1);
        await playTo(semi1, 1);
        await start(semi2);
        await playTo(semi2, 1);
        await bet(s.X, final, s.A, 100);
        expect(await enterGameResult(pool, semi1, { game: 1, winnerSlot: 2, points1: 3, points2: 15 })).toMatchObject({ ok: true });
        expect(await balance(s.X)).toBe(1000);
        expect((await statuses(final)).map((b) => b.status)).toEqual(['refunded']);
    });
});

describe('ledger', () => {
    it('refuses a balance change that is not in the ledger', async () => {
        const s = await setup();
        await expect(pool.query('UPDATE players SET foza_balance = foza_balance + 5 WHERE id = $1', [s.X])).rejects.toThrow(/ledger sums to/);
        await expect(
            pool.query(`INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, join_code) VALUES ($1, 'Rich', 'rich', '\\x00', '\\x00', 500, $2)`, [s.eventId, newJoinCode()]),
        ).rejects.toThrow(/ledger sums to/);
        expect(await balance(s.X)).toBe(1000);
    });

    it('keeps rows from being changed or removed, and refuses rows that would overdraw', async () => {
        const s = await setup();
        await expect(pool.query('UPDATE foza_ledger SET amount = 5000')).rejects.toThrow(/cannot be changed/);
        await expect(pool.query('DELETE FROM foza_ledger')).rejects.toThrow(/cannot be changed/);
        await expect(inTransaction(pool, (c) => addLedger(c, [{ playerId: s.X, type: 'admin_adjustment', amount: -1001, reason: 'x' }]))).rejects.toThrow(/below 0/);
        expect(await balance(s.X)).toBe(1000);
    });

    it('records an admin adjustment with its reason and never takes a balance below 0', async () => {
        const s = await setup();
        expect(await adjustBalance(pool, s.X, 250, ' Won the quiz ', '42')).toEqual({ ok: true, eventId: s.eventId, balance: 1250 });
        expect(await adjustBalance(pool, s.X, -1251, 'Too much', '42')).toEqual({ ok: false, error: 'balance' });
        expect(await adjustBalance(pool, s.X, -1250, 'All of it', '42')).toMatchObject({ ok: true, balance: 0 });
        expect(await adjustBalance(pool, s.X, 0, 'Nothing', '42')).toEqual({ ok: false, error: 'amount' });
        expect(await adjustBalance(pool, s.X, 5, '   ', '42')).toEqual({ ok: false, error: 'reason' });
        expect(await adjustBalance(pool, 999_999, 5, 'Nobody', '42')).toEqual({ ok: false, error: 'not-found' });
        const rows = (await listLedger(pool, s.X)).filter((r) => r.type === 'admin_adjustment');
        expect(rows.map((r) => [r.amount, r.reason])).toEqual([
            [250, 'Won the quiz'],
            [-1250, 'All of it'],
        ]);
        expect((await pool.query('SELECT DISTINCT admin_id FROM foza_ledger WHERE type = $1', ['admin_adjustment'])).rows).toEqual([{ admin_id: '42' }]);
    });

    it('writes the starting Foza at sign-up as the first ledger row', async () => {
        const eventId = await createEvent(pool, { ...lan, startingFoza: 750 });
        await setActiveEvent(pool, eventId);
        const result = await signUpPlayer(pool, { code: lan.code, nickname: 'Ola', nicknameKey: 'ola', pin: '1234' }, 'ip:192.0.2.1', NOW);
        if (!result.ok) throw new Error(result.error);
        expect(await ledgerTypes(result.playerId)).toEqual([['starting', 750]]);
        expect(await balance(result.playerId)).toBe(750);
    });

    it('moves the balances of players from before the migration into the ledger', async () => {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
        try {
            for (const { name } of readMigrations().filter((m) => m.name < '0006')) copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
            await migrate(pool, dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        // A plain insert, since createEvent writes columns that later migrations add.
        const eventId = (
            await pool.query<{ id: number }>(
                `INSERT INTO events (name, starts_on, ends_on, code, starting_foza, daily_foza) VALUES ('LAN 2026', '2026-11-20', '2026-11-22', 'LAN-2026', 1000, 100) RETURNING id`,
            )
        ).rows[0].id;
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance) VALUES
             ($1, 'Old1', 'old1', '\\x00', '\\x00', 1000), ($1, 'Old2', 'old2', '\\x00', '\\x00', 0) RETURNING id`,
            [eventId],
        );
        await migrate(pool);
        expect(await ledgerTypes(rows[0].id)).toEqual([['starting', 1000]]);
        expect(await ledgerTypes(rows[1].id)).toEqual([['starting', 0]]);
        expect(await balance(rows[0].id)).toBe(1000);
        await expect(pool.query('UPDATE players SET foza_balance = 1 WHERE id = $1', [rows[1].id])).rejects.toThrow(/ledger sums to/);
    });
});

describe('daily Foza', () => {
    it('is paid once per calendar day in Oslo, with the day changing at Oslo midnight', async () => {
        const s = await setup();
        // 23:59:59 on 20 November in Oslo is 22:59:59 UTC. The player signed up on 20 November.
        expect(await getBalance(pool, s.X, new Date('2026-11-20T22:59:59Z'))).toBe(1000);
        // Midnight in Oslo, still 20 November in UTC.
        expect(await getBalance(pool, s.X, new Date('2026-11-20T23:00:00Z'))).toBe(1100);
        expect(await getBalance(pool, s.X, new Date('2026-11-21T12:00:00Z'))).toBe(1100);
        expect(await getBalance(pool, s.X, new Date('2026-11-21T22:59:59Z'))).toBe(1100);
        expect(await getBalance(pool, s.X, new Date('2026-11-21T23:00:00Z'))).toBe(1200);
        expect((await listLedger(pool, s.X)).filter((r) => r.type === 'daily').map((r) => r.day)).toEqual(['2026-11-21', '2026-11-22']);
    });

    it('tells the daily Foza of today, also on a later read that day, and none on the sign-up day', async () => {
        const s = await setup();
        expect(await getWallet(pool, s.X, new Date('2026-11-20T12:00:00Z'))).toEqual({ balance: 1000, dailyToday: null });
        expect(await getWallet(pool, s.X, new Date('2026-11-21T08:00:00Z'))).toEqual({ balance: 1100, dailyToday: 100 });
        expect(await getWallet(pool, s.X, new Date('2026-11-21T20:00:00Z'))).toEqual({ balance: 1100, dailyToday: 100 });
        // A changed daily amount does not change what was paid today.
        await updateEvent(pool, s.eventId, { ...lan, dailyFoza: 250 });
        expect(await getWallet(pool, s.X, new Date('2026-11-21T21:00:00Z'))).toEqual({ balance: 1100, dailyToday: 100 });
        expect(await getWallet(pool, s.X, new Date('2026-11-22T08:00:00Z'))).toEqual({ balance: 1350, dailyToday: 250 });
        await clearActiveEvent(pool);
        expect(await getWallet(pool, s.X, new Date('2026-11-23T08:00:00Z'))).toEqual({ balance: 1350, dailyToday: null });
        expect(await getWallet(pool, 999999, new Date('2026-11-23T08:00:00Z'))).toBeNull();
    });

    it('follows summer time in Oslo', async () => {
        const eventId = await createEvent(pool, lan);
        await setActiveEvent(pool, eventId);
        const player = await addPlayer(eventId, 'Summer', 1000, new Date('2026-06-30T10:00:00Z'));
        // In July Oslo is two hours ahead of UTC.
        expect(await getBalance(pool, player, new Date('2026-07-01T21:59:59Z'))).toBe(1100);
        expect(await getBalance(pool, player, new Date('2026-07-01T22:00:00Z'))).toBe(1200);
    });

    it('is paid once when several reads run at once', async () => {
        const s = await setup();
        const day = new Date('2026-11-21T12:00:00Z');
        const client = await pool.connect();
        let results;
        try {
            // Holds the player row, so every read has written its daily row before any of them can go on.
            await client.query('BEGIN');
            await client.query('SELECT 1 FROM players WHERE id = $1 FOR UPDATE', [s.X]);
            const reads = Promise.all(Array.from({ length: 4 }, () => getBalance(pool, s.X, day)));
            await waitForLockWaiters(4);
            await client.query('COMMIT');
            results = await reads;
        } finally {
            client.release();
        }
        expect(new Set(results)).toEqual(new Set([1100]));
        expect((await listLedger(pool, s.X)).filter((r) => r.type === 'daily')).toHaveLength(1);
    });

    it('is paid before a bet in the same transaction', async () => {
        const s = await setup({ ...lan, startingFoza: 0 });
        const id = await oneVsOne(s.A, s.B);
        expect(await bet(s.X, id, s.A, 100, NOW)).toEqual({ ok: false, error: 'balance' });
        expect(await bet(s.X, id, s.A, 100, new Date('2026-11-21T08:00:00Z'))).toMatchObject({ ok: true, balance: 0 });
        expect(await ledgerTypes(s.X)).toEqual([
            ['starting', 0],
            ['daily', 100],
            ['bet', -100],
        ]);
    });

    it('is not paid while the event is inactive, and follows a changed daily amount', async () => {
        const s = await setup();
        await clearActiveEvent(pool);
        expect(await getBalance(pool, s.X, new Date('2026-11-21T12:00:00Z'))).toBe(1000);
        await setActiveEvent(pool, s.eventId);
        await updateEvent(pool, s.eventId, { ...lan, dailyFoza: 250 });
        expect(await getBalance(pool, s.X, new Date('2026-11-21T12:00:00Z'))).toBe(1250);
        await updateEvent(pool, s.eventId, { ...lan, dailyFoza: 0 });
        expect(await getBalance(pool, s.X, new Date('2026-11-22T12:00:00Z'))).toBe(1250);
    });
});

describe('concurrency', () => {
    /** Holds the tournament row of a match, as a match change in progress does, until release is called. */
    async function holdTournament(matchId: number) {
        const client: PoolClient = await pool.connect();
        await client.query('BEGIN');
        await client.query('SELECT 1 FROM tournaments t JOIN matches m ON m.tournament_id = t.id WHERE m.id = $1 FOR NO KEY UPDATE OF t', [matchId]);
        return async () => {
            await client.query('COMMIT');
            client.release();
        };
    }

    it('lands a bet that took the match lock before the start, before the start can go on', async () => {
        const s = await setup();
        const [id] = await tournament(s.eventId, [s.A, s.B]);
        await callMatch(pool, id);
        // Writing a bet is slowed down, so a start that did not wait for the bet would finish first.
        await pool.query(`CREATE FUNCTION slow_bet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.5); RETURN NEW; END; $$`);
        await pool.query('CREATE TRIGGER slow_bet BEFORE INSERT ON bets FOR EACH ROW EXECUTE FUNCTION slow_bet()');
        const release = await holdTournament(id);
        const placing = bet(s.X, id, s.A, 100);
        await waitForLockWaiters(1);
        const starting = reportPlayersConnected(pool, id);
        await waitForLockWaiters(2);
        await release();
        expect(await starting).toMatchObject({ ok: true, started: true });
        // The start waited for the bet to commit.
        expect(await statuses(id)).toEqual([{ player_id: s.X, status: 'open', amount: 100, payout: 0 }]);
        expect(await placing).toMatchObject({ ok: true });
    });

    it('refuses a bet that waited for the match lock while the match started', async () => {
        const s = await setup();
        const [id] = await tournament(s.eventId, [s.A, s.B]);
        await callMatch(pool, id);
        const release = await holdTournament(id);
        const starting = reportPlayersConnected(pool, id);
        await waitForLockWaiters(1);
        const placing = bet(s.X, id, s.A, 100);
        await waitForLockWaiters(2);
        await release();
        expect(await starting).toMatchObject({ ok: true, started: true });
        expect(await placing).toEqual({ ok: false, error: 'closed' });
        expect(await statuses(id)).toEqual([]);
        expect(await balance(s.X)).toBe(1000);
    });

    it('locks every bettor of a change in player order before it changes a balance', async () => {
        const s = await setup();
        const [semi1, semi2, final] = await tournament(s.eventId, [s.A, s.B, s.C, s.D]);
        // Y backs the winner of semi 1 and X bets on the final. X has the lower id.
        expect(s.X).toBeLessThan(s.Y);
        await bet(s.Y, semi1, s.A, 100);
        await start(semi1);
        await playTo(semi1, 1);
        await start(semi2);
        await playTo(semi2, 1);
        await bet(s.X, final, s.A, 100);

        // The correction reverses the payout of Y first and then refunds X, since the final gets new players.
        const holder = await pool.connect();
        const probe = await pool.connect();
        try {
            await holder.query('BEGIN');
            await holder.query('SELECT 1 FROM players WHERE id = $1 FOR UPDATE', [s.Y]);
            const correcting = enterGameResult(pool, semi1, { game: 1, winnerSlot: 2, points1: 3, points2: 15 });
            await waitForLockWaiters(1);
            // While the correction waits for Y, it already holds X, the lower id.
            await probe.query('BEGIN');
            const held = await probe.query('SELECT 1 FROM players WHERE id = $1 FOR UPDATE NOWAIT', [s.X]).then(
                () => false,
                (error: Error) => /could not obtain lock/.test(error.message),
            );
            await probe.query('ROLLBACK');
            await holder.query('COMMIT');
            expect(await correcting).toMatchObject({ ok: true });
            expect(held).toBe(true);
        } finally {
            await probe.query('ROLLBACK').catch(() => undefined);
            await holder.query('ROLLBACK').catch(() => undefined);
            holder.release();
            probe.release();
        }
        // Nobody backed D, the new winner of semi 1, so Y gets the stake back.
        expect(await balances({ X: s.X, Y: s.Y })).toEqual({ X: 1000, Y: 1000 });
    });

    it('never lets two bets from the same player at once spend the same Foza', async () => {
        const s = await setup();
        const first = await oneVsOne(s.A, s.B);
        const second = await oneVsOne(s.C, s.D);
        const client = await pool.connect();
        let results;
        try {
            // Holds the player row, so both bets reach it at the same time.
            await client.query('BEGIN');
            await client.query('SELECT 1 FROM players WHERE id = $1 FOR UPDATE', [s.X]);
            const both = Promise.all([bet(s.X, first, s.A, 700), bet(s.X, second, s.C, 700)]);
            await waitForLockWaiters(2);
            await client.query('COMMIT');
            results = await both;
        } finally {
            client.release();
        }
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        expect(results.filter((r) => !r.ok && r.error === 'balance')).toHaveLength(1);
        expect(await balance(s.X)).toBe(300);
    });
});

describe('reading for stats', () => {
    it('lists a player bets with results, the Foza summary and the pools of an event', async () => {
        const s = await setup();
        const won = await oneVsOne(s.A, s.B);
        const lost = await oneVsOne(s.C, s.D);
        const open = await oneVsOne(s.A, s.C);
        await bet(s.X, won, s.A, 100);
        await bet(s.Y, won, s.B, 300);
        await bet(s.X, lost, s.C, 50);
        await bet(s.Y, lost, s.D, 50);
        await bet(s.X, open, s.C, 20);
        await adjustBalance(pool, s.X, 30, 'Pizza duty', '42');
        await start(won);
        await playTo(won, 1);
        await start(lost);
        await playTo(lost, 2);

        const bets = await listPlayerBets(pool, s.X);
        expect(bets.map((b) => [b.matchId, b.onNickname, b.amount, b.status, b.payout, b.net])).toEqual([
            [open, 'C', 20, 'open', 0, null],
            [lost, 'C', 50, 'lost', 0, -50],
            [won, 'A', 100, 'won', 400, 300],
        ]);
        expect(await getFozaSummary(pool, s.X)).toEqual({
            playerId: s.X,
            nickname: 'X',
            balance: 1000 - 170 + 400 + 30,
            starting: 1000,
            daily: 0,
            adjustments: 30,
            earned: 1030,
            won: 300,
            lost: 50,
            openStake: 20,
            betsWon: 1,
            betsLost: 1,
        });
        const summaries = await listFozaSummaries(pool, s.eventId);
        expect(summaries.map((r) => r.nickname)).toEqual(['A', 'B', 'C', 'D', 'X', 'Y', 'Z']);
        expect(summaries.find((r) => r.playerId === s.Y)).toMatchObject({ won: 50, lost: 300, betsWon: 1, betsLost: 1 });

        expect(await getMatchPool(pool, open)).toEqual({ matchId: open, open: true, total: 20, sides: [
            { playerId: s.A, stake: 0, bettors: 0, multiplier: null },
            { playerId: s.C, stake: 20, bettors: 1, multiplier: 1 },
        ] });
        expect(await getMatchPool(pool, won)).toMatchObject({ open: false, total: 400, sides: [{ stake: 100, multiplier: 4 }, { stake: 300 }] });
        expect(await getMatchPool(pool, 999_999)).toBeNull();
        expect((await listMatchPools(pool, s.eventId)).map((p) => [p.matchId, p.total])).toEqual([
            [won, 400],
            [lost, 100],
            [open, 20],
        ]);
    });
});
