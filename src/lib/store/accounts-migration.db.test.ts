import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS_DIR, readMigrations } from '../../../scripts/migrate.mjs';
import { newJoinCode } from '@/lib/players/join-code';
import { hashPin } from '@/lib/players/pin';
import { hashSessionToken } from '@/lib/players/session';
import { replayElo, type RatedMatch } from '@/lib/stats/elo';
import { getSessionAccount, signInPlayer } from './players';
import { eloForEvent } from './stats';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const NAME = '0021_accounts.sql';
const now = new Date('2026-11-21T12:00:00Z');

afterAll(async () => {
    await pool.end();
});

/** Migrates a fresh schema up to the file before the accounts. */
async function migrateBeforeAccounts() {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const dir = mkdtempSync(join(tmpdir(), 'bvt-accounts-'));
    try {
        for (const { name } of readMigrations()) if (name < NAME) copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
        await migrate(pool, dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const runDown = () => pool.query(readFileSync(join(MIGRATIONS_DIR, 'down', NAME), 'utf8'));

interface Seed {
    lan1: number;
    lan2: number;
    ids: Record<string, number>;
    pins: Record<string, Buffer>;
}

/** Two LANs in the shape from before the accounts. Ola and Kari play at both, Ola with other letter case. */
async function seed(): Promise<Seed> {
    const event = async (name: string, startsOn: string, active: boolean) =>
        (
            await pool.query<{ id: number }>(
                `INSERT INTO events (name, starts_on, ends_on, code, starting_foza, daily_foza, is_active) VALUES ($1, $2, $2, $3, 1000, 0, $4) RETURNING id`,
                [name, startsOn, `CODE-${startsOn}`, active],
            )
        ).rows[0].id;
    // The older LAN is made last, so the ids do not follow the dates.
    const lan2 = await event('LAN 2026', '2026-11-20', true);
    const lan1 = await event('LAN 2025', '2025-11-20', false);
    const ids: Record<string, number> = {};
    const pins: Record<string, Buffer> = {};
    const player = async (key: string, eventId: number, nickname: string, pin: string, lock: { failed?: number; until?: Date; level?: number; last?: Date } = {}) => {
        const hashed = await hashPin(pin);
        const created = eventId === lan1 ? new Date('2025-11-20T10:00:00Z') : new Date('2026-11-20T10:00:00Z');
        ids[key] = (
            await pool.query<{ id: number }>(
                `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, join_code, created_at,
                     failed_pin_attempts, locked_until, lock_level, last_failed_pin_at)
                 VALUES ($1, $2, lower($2), $3, $4, 0, $5, $6, $7, $8, $9, $10) RETURNING id`,
                [eventId, nickname, hashed.hash, hashed.salt, newJoinCode(), created, lock.failed ?? 0, lock.until ?? null, lock.level ?? 0, lock.last ?? null],
            )
        ).rows[0].id;
        pins[key] = hashed.hash;
        await pool.query(`INSERT INTO foza_ledger (player_id, type, amount) VALUES ($1, 'starting', 1000)`, [ids[key]]);
    };
    await player('ola1', lan1, 'Ola', '1111');
    await player('kari1', lan1, 'Kari', '2222');
    await player('per1', lan1, 'Per', '3333');
    await player('ola2', lan2, 'OLA', '4444', { failed: 2, level: 1, last: new Date('2026-11-21T11:00:00Z') });
    await player('kari2', lan2, 'Kari', '5555');
    await player('nina2', lan2, 'Nina', '6666');

    const played = async (eventId: number, winner: number, loser: number, startedAt: string) => {
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO matches (event_id, best_of, player1_id, player2_id, accepted_at, score1, winner_id, result, state, called_at, started_at, finished_at)
             VALUES ($1, 1, $2, $3, $4, 1, $2, 'played', 'finished', $4, $4, $4) RETURNING id`,
            [eventId, winner, loser, startedAt],
        );
        await pool.query(`INSERT INTO match_games (match_id, number, status, winner_slot, points1, points2, source) VALUES ($1, 1, 'finished', 1, 15, 7, 'admin')`, [rows[0].id]);
        return rows[0].id;
    };
    const m1 = await played(lan1, ids.ola1, ids.kari1, '2025-11-20T12:00:00Z');
    await played(lan1, ids.kari1, ids.per1, '2025-11-20T13:00:00Z');
    await played(lan2, ids.nina2, ids.ola2, '2026-11-20T12:00:00Z');
    await played(lan2, ids.kari2, ids.ola2, '2026-11-20T13:00:00Z');

    // A settled bet with its ledger rows, and a training game.
    const bet = (
        await pool.query<{ id: number }>(
            `INSERT INTO bets (match_id, player_id, on_player_id, amount, status, payout, settled_at) VALUES ($1, $2, $3, 100, 'won', 100, now()) RETURNING id`,
            [m1, ids.per1, ids.ola1],
        )
    ).rows[0].id;
    await pool.query(`INSERT INTO foza_ledger (player_id, type, amount, bet_id, match_id) VALUES ($1, 'bet', -100, $2, $3), ($1, 'payout', 100, $2, $3)`, [ids.per1, bet, m1]);
    await pool.query(
        `INSERT INTO training_matches (event_id, player_id, bot, difficulty, score_to_win, game_speed, state, report_id, player_points, bot_points, won, game_started_at, game_ended_at)
         VALUES ($1, $2, 'reduced', 13, 15, 75, 'finished', 'r-1', 15, 3, true, now(), now())`,
        [lan2, ids.nina2],
    );
    // Sessions from before: one on the old LAN and one on the new.
    await pool.query(`INSERT INTO player_sessions (token_hash, player_id, expires_at) VALUES ($1, $2, $4), ($3, $5, $4)`, [
        hashSessionToken('a'.repeat(43)),
        ids.ola1,
        hashSessionToken('b'.repeat(43)),
        new Date('2026-11-25T00:00:00Z'),
        ids.nina2,
    ]);
    return { lan1, lan2, ids, pins };
}

/** Every row the accounts must not change, as JSON. Nicknames and the live counter are left out. */
async function untouched(): Promise<Record<string, unknown[]>> {
    const read = async (sql: string) => (await pool.query(sql)).rows;
    return {
        events: await read('SELECT id, name, starts_on, ends_on, code, starting_foza, daily_foza, is_active, created_at FROM events ORDER BY id'),
        players: await read(
            `SELECT id, event_id, nickname_key, pin_hash, pin_salt, failed_pin_attempts, locked_until, lock_level, last_failed_pin_at, foza_balance, join_code, created_at
             FROM players ORDER BY id`,
        ),
        matches: await read('SELECT * FROM matches ORDER BY id'),
        match_games: await read('SELECT * FROM match_games ORDER BY match_id, number'),
        bets: await read('SELECT * FROM bets ORDER BY id'),
        foza_ledger: await read('SELECT * FROM foza_ledger ORDER BY id'),
        training_matches: await read('SELECT * FROM training_matches ORDER BY id'),
        sessions: await read('SELECT token_hash, player_id, created_at, expires_at FROM player_sessions ORDER BY token_hash'),
    };
}

// Elo knows a player by the account. Any number stands for one here.
const KEY = { ola: 1, kari: 2, per: 3, nina: 4 } as const;
const rated = (winner: keyof typeof KEY, loser: keyof typeof KEY): RatedMatch => ({ matchId: 0, eventId: 0, tournamentId: null, winner: KEY[winner], loser: KEY[loser] });

describe('0021_accounts.sql', () => {
    let s: Seed;
    beforeEach(async () => {
        await migrateBeforeAccounts();
        s = await seed();
    });

    it('merges players by nickname into accounts, keeps the newest PIN and changes nothing else', async () => {
        const before = await untouched();
        expect(await migrate(pool)).toEqual([NAME]);

        const accounts = (
            await pool.query<{ id: number; nickname: string; nickname_key: string; pin_hash: Buffer; failed_pin_attempts: number; lock_level: number; last_failed_pin_at: Date | null; created_at: Date }>(
                'SELECT * FROM accounts ORDER BY nickname_key',
            )
        ).rows;
        expect(accounts.map((a) => a.nickname)).toEqual(['Kari', 'Nina', 'OLA', 'Per']);
        const account = Object.fromEntries(accounts.map((a) => [a.nickname_key, a]));
        // The newest LAN gives the PIN and the lock, the oldest player the age.
        expect(account.ola.pin_hash).toEqual(s.pins.ola2);
        expect(account.ola).toMatchObject({ failed_pin_attempts: 2, lock_level: 1, last_failed_pin_at: new Date('2026-11-21T11:00:00Z'), created_at: new Date('2025-11-20T10:00:00Z') });
        expect(account.kari.pin_hash).toEqual(s.pins.kari2);
        expect(account.per.pin_hash).toEqual(s.pins.per1);

        const players = (await pool.query<{ id: number; account_id: number; nickname: string }>('SELECT id, account_id, nickname FROM players ORDER BY id')).rows;
        const byId = new Map(players.map((p) => [p.id, p]));
        expect(byId.get(s.ids.ola1)!.account_id).toBe(account.ola.id);
        expect(byId.get(s.ids.ola2)!.account_id).toBe(account.ola.id);
        expect(byId.get(s.ids.kari1)!.account_id).toBe(byId.get(s.ids.kari2)!.account_id);
        // The older LAN shows the nickname of the account now.
        expect(byId.get(s.ids.ola1)!.nickname).toBe('OLA');

        // Every row is still there, the same, and the sessions now name their account.
        expect(await untouched()).toEqual(before);
        const sessions = (await pool.query<{ player_id: number; account_id: number }>('SELECT player_id, account_id FROM player_sessions')).rows;
        expect(sessions).toHaveLength(2);
        for (const session of sessions) expect(session.account_id).toBe(byId.get(session.player_id)!.account_id);
        // The session from the old LAN now signs Ola in to the new one.
        expect((await getSessionAccount(pool, 'a'.repeat(43), now))?.player?.id).toBe(s.ids.ola2);

        // The PIN of the newest LAN works. The old one does not.
        expect(await signInPlayer(pool, 'ola', '4444', 'ip:192.0.2.1', now)).toEqual({ ok: true, accountId: account.ola.id });
        expect(await signInPlayer(pool, 'kari', '2222', 'ip:192.0.2.1', now)).toEqual({ ok: false, error: 'wrong' });
    });

    it('carries the Elo of a player from one LAN into the next', async () => {
        await migrate(pool);
        const lan1 = replayElo([rated('ola', 'kari'), rated('kari', 'per')]).ratings;
        const both = replayElo([rated('ola', 'kari'), rated('kari', 'per'), rated('nina', 'ola'), rated('kari', 'ola')]).ratings;
        const elo = await eloForEvent(pool, s.lan2);
        expect(elo.get(s.ids.ola2)!.start).toBeCloseTo(lan1.get(KEY.ola)!, 9);
        expect(elo.get(s.ids.ola2)!.rating).toBeCloseTo(both.get(KEY.ola)!, 9);
        expect(elo.get(s.ids.kari2)!.start).toBeCloseTo(lan1.get(KEY.kari)!, 9);
        expect(elo.get(s.ids.nina2)!.start).toBe(1000);
        expect((await eloForEvent(pool, s.lan1)).get(s.ids.ola1)!.rating).toBeCloseTo(lan1.get(KEY.ola)!, 9);
    });

    it('turns back with the down file and applies again', async () => {
        const before = await untouched();
        await migrate(pool);
        // A PIN reset and a sign-in after the migration.
        const reset = await hashPin('9999');
        await pool.query(`UPDATE accounts SET pin_hash = $1, pin_salt = $2 WHERE nickname_key = 'kari'`, [reset.hash, reset.salt]);
        const kari = (await pool.query<{ id: number }>(`SELECT id FROM accounts WHERE nickname_key = 'kari'`)).rows[0].id;
        await pool.query('INSERT INTO player_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)', [hashSessionToken('c'.repeat(43)), kari, new Date('2026-11-25T00:00:00Z')]);

        await runDown();
        expect((await pool.query("SELECT to_regclass('accounts') AS t")).rows[0].t).toBeNull();
        expect((await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [NAME])).rowCount).toBe(0);
        const columns = (await pool.query<{ column_name: string; is_nullable: string }>(
            `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name IN ('players', 'player_sessions') AND column_name IN ('account_id', 'pin_hash', 'pin_salt', 'player_id')`,
        )).rows;
        expect(columns.every((c) => c.column_name !== 'account_id' && c.is_nullable === 'NO')).toBe(true);

        // Each player row has the PIN of its account. The new session points at the player of the active LAN.
        const after = await untouched();
        const pinOf = (rows: unknown[], id: number) => (rows as { id: number; pin_hash: Buffer }[]).find((r) => r.id === id)!.pin_hash;
        expect(pinOf(after.players, s.ids.kari1)).toEqual(reset.hash);
        expect(pinOf(after.players, s.ids.kari2)).toEqual(reset.hash);
        expect(pinOf(after.players, s.ids.ola1)).toEqual(s.pins.ola2);
        expect((after.sessions as { player_id: number }[]).map((r) => r.player_id).sort()).toEqual([s.ids.ola1, s.ids.nina2, s.ids.kari2].sort());
        // The PIN lock comes from the account too.
        const ola1 = (after.players as Record<string, unknown>[]).find((r) => r.id === s.ids.ola1)!;
        expect(ola1).toMatchObject({ failed_pin_attempts: 2, lock_level: 1, last_failed_pin_at: new Date('2026-11-21T11:00:00Z') });
        const PIN_COLUMNS = ['pin_hash', 'pin_salt', 'failed_pin_attempts', 'locked_until', 'lock_level', 'last_failed_pin_at'];
        const skip = (rows: unknown[]) => (rows as Record<string, unknown>[]).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !PIN_COLUMNS.includes(key))));
        expect(skip(after.players)).toEqual(skip(before.players));
        for (const table of ['events', 'matches', 'match_games', 'bets', 'foza_ledger', 'training_matches'] as const) expect(after[table]).toEqual(before[table]);

        expect(await migrate(pool)).toEqual([NAME]);
        expect((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n).toBe(4);
    });
});
