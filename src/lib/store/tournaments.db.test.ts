import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../scripts/migrate.mjs';
import { generateBracket, type FormatId, type PlannedBracket } from '@/lib/bracket';
import type { EventInput } from '@/lib/events/input';
import { createEvent, setActiveEvent } from './events';
import { getTournament, listTournaments, saveTournament } from './tournaments';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };
const other: EventInput = { ...lan, name: 'LAN 2025', code: 'LAN-2025' };

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

/** Adds players straight into the table. The PIN columns are not used here. */
async function addPlayers(eventId: number, count: number, prefix = 'P'): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 1; i <= count; i++) {
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance)
             VALUES ($1, $2, $3, '\\x00', '\\x00', 0) RETURNING id`,
            [eventId, `${prefix}${i}`, `${prefix.toLowerCase()}${i}`],
        );
        ids.push(rows[0].id);
    }
    return ids;
}

async function activeEvent(players: number) {
    const eventId = await createEvent(pool, lan);
    await setActiveEvent(pool, eventId);
    return { eventId, players: await addPlayers(eventId, players) };
}

const plan = (format: FormatId, players: number[], seed = 99): PlannedBracket =>
    generateBracket({ format, players, seeding: { method: 'random', seed }, rounds: { 'winners-1': { bestOf: 3 }, 'winners-4': { bestOf: 5 }, 'final-1': { bestOf: 7, ruleFile: 'final.lua' } } });

/** Swaps the saved ids for 1, 2, 3 in play order, so a saved bracket can be compared with the plan. */
function asPlanned(saved: NonNullable<Awaited<ReturnType<typeof getTournament>>>) {
    const local = new Map(saved.matches.map((m, i) => [m.id, i + 1]));
    const link = (to: { matchId: number; slot: 1 | 2 } | null) => (to ? { matchId: local.get(to.matchId)!, slot: to.slot } : null);
    return saved.matches.map((m) => ({ ...m, id: local.get(m.id)!, winnerTo: link(m.winnerTo), loserTo: link(m.loserTo) }));
}

describe('saveTournament and getTournament', () => {
    it.each(['single_elimination', 'double_elimination'] as const)('save and load a %s bracket unchanged', async (format) => {
        const { eventId, players } = await activeEvent(11);
        const bracket = plan(format, players);
        const result = await saveTournament(pool, eventId, { name: 'Friday cup', seeding: 'random', randomSeed: 99, bracket });
        if (!result.ok) throw new Error(result.error);

        const saved = await getTournament(pool, result.id);
        expect(saved).toMatchObject({ id: result.id, eventId, name: 'Friday cup', format, seeding: 'random', randomSeed: 99 });
        expect(saved!.players.map((p) => p.playerId)).toEqual(bracket.seeds);
        expect(saved!.players.map((p) => p.seed)).toEqual(bracket.seeds.map((_, i) => i + 1));
        expect(saved!.players[0].nickname).toMatch(/^P\d+$/);
        expect(asPlanned(saved!)).toEqual(bracket.matches.map(({ id, section, round, position, bestOf, ruleFile, players, winnerTo, loserTo }) => ({ id, section, round, position, bestOf, ruleFile, players, winnerTo, loserTo })));
        const final = saved!.matches.at(-1)!;
        expect(final).toMatchObject(format === 'double_elimination' ? { bestOf: 7, ruleFile: 'final.lua', winnerTo: null } : { bestOf: 5, ruleFile: 'default.lua', winnerTo: null });
        expect(saved!.matches[0]).toMatchObject({ bestOf: 3 });
        // Every link points at a real match of the same tournament.
        const own = new Set(saved!.matches.map((m) => m.id));
        for (const m of saved!.matches) {
            if (m.winnerTo) expect(own.has(m.winnerTo.matchId)).toBe(true);
            if (m.loserTo) expect(own.has(m.loserTo.matchId)).toBe(true);
        }
    });

    it('stores no random seed for hand seeding and lists the tournaments of the event', async () => {
        const { eventId, players } = await activeEvent(4);
        const bracket = generateBracket({ format: 'single_elimination', players, seeding: { method: 'manual', order: [...players].reverse() } });
        const first = await saveTournament(pool, eventId, { name: 'Hand cup', seeding: 'manual', randomSeed: null, bracket });
        const second = await saveTournament(pool, eventId, { name: 'Random cup', seeding: 'random', randomSeed: 1, bracket: plan('double_elimination', players.slice(0, 3), 1) });
        if (!first.ok || !second.ok) throw new Error('not saved');
        expect(await getTournament(pool, first.id)).toMatchObject({ seeding: 'manual', randomSeed: null });
        expect((await getTournament(pool, first.id))!.players.map((p) => p.playerId)).toEqual([...players].reverse());
        expect(await listTournaments(pool, eventId)).toEqual([
            { id: second.id, name: 'Random cup', format: 'double_elimination', playerCount: 3 },
            { id: first.id, name: 'Hand cup', format: 'single_elimination', playerCount: 4 },
        ]);
        expect(await getTournament(pool, second.id + 100)).toBeNull();
    });

    it('refuses an event that is not active and saves nothing', async () => {
        const eventId = await createEvent(pool, lan);
        const players = await addPlayers(eventId, 3);
        expect(await saveTournament(pool, eventId, { name: 'Cup', seeding: 'random', randomSeed: 1, bracket: plan('single_elimination', players) })).toEqual({ ok: false, error: 'no-event' });
        expect((await pool.query('SELECT count(*)::int AS n FROM tournaments')).rows[0].n).toBe(0);
    });

    it('refuses players from another event and saves nothing', async () => {
        const { eventId, players } = await activeEvent(3);
        const otherId = await createEvent(pool, other);
        const stranger = await addPlayers(otherId, 1, 'X');
        const result = await saveTournament(pool, eventId, { name: 'Cup', seeding: 'random', randomSeed: 1, bracket: plan('single_elimination', [...players, ...stranger]) });
        expect(result).toEqual({ ok: false, error: 'players' });
        for (const table of ['tournaments', 'tournament_players', 'bracket_matches']) {
            expect((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
        }
    });
});

describe('tournament schema', () => {
    async function savedTournament() {
        const { eventId, players } = await activeEvent(4);
        const result = await saveTournament(pool, eventId, { name: 'Cup', seeding: 'random', randomSeed: 1, bracket: plan('double_elimination', players) });
        if (!result.ok) throw new Error(result.error);
        const { rows } = await pool.query<{ id: number }>('SELECT id FROM bracket_matches WHERE tournament_id = $1 ORDER BY id', [result.id]);
        return { eventId, players, tournamentId: result.id, matchIds: rows.map((r) => r.id) };
    }

    it('allows only best of 1, 3, 5 or 7 and plain .lua rule files', async () => {
        const { matchIds } = await savedTournament();
        await expect(pool.query('UPDATE bracket_matches SET best_of = 2 WHERE id = $1', [matchIds[0]])).rejects.toThrow(/best_of/);
        await expect(pool.query("UPDATE bracket_matches SET rule_file = '../x.lua' WHERE id = $1", [matchIds[0]])).rejects.toThrow(/rule_file/);
        await pool.query("UPDATE bracket_matches SET best_of = 7, rule_file = 'other.lua' WHERE id = $1", [matchIds[0]]);
    });

    it('keeps a player in a slot to the players of the tournament', async () => {
        const { eventId, matchIds } = await savedTournament();
        const [outsider] = await addPlayers(eventId, 1, 'Late');
        await expect(pool.query('UPDATE bracket_matches SET player1_id = $2 WHERE id = $1', [matchIds.at(-1), outsider])).rejects.toThrow(/foreign key/);
    });

    it('keeps the next match in the same tournament', async () => {
        const first = await savedTournament();
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO tournaments (event_id, name, format, seeding, random_seed) VALUES ($1, 'Other', 'single_elimination', 'manual', NULL) RETURNING id`,
            [first.eventId],
        );
        const other = await pool.query<{ id: number }>(`INSERT INTO bracket_matches (tournament_id, section, round, position, best_of) VALUES ($1, 'winners', 1, 1, 1) RETURNING id`, [rows[0].id]);
        await expect(pool.query('UPDATE bracket_matches SET next_winner_match_id = $2, next_winner_slot = 1 WHERE id = $1', [other.rows[0].id, first.matchIds[0]])).rejects.toThrow(/foreign key/);
    });

    it('needs a random seed exactly when the seeding is random', async () => {
        const eventId = await createEvent(pool, lan);
        const insert = (seeding: string, seed: number | null) =>
            pool.query(`INSERT INTO tournaments (event_id, name, format, seeding, random_seed) VALUES ($1, 'Cup', 'single_elimination', $2, $3)`, [eventId, seeding, seed]);
        await expect(insert('random', null)).rejects.toThrow(/check/);
        await expect(insert('elo', 5)).rejects.toThrow(/check/);
        await insert('elo', null);
        await insert('random', 5);
    });

    it('removes the players and matches with the tournament', async () => {
        const { tournamentId } = await savedTournament();
        await pool.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
        expect((await pool.query('SELECT count(*)::int AS n FROM bracket_matches')).rows[0].n).toBe(0);
        expect((await pool.query('SELECT count(*)::int AS n FROM tournament_players')).rows[0].n).toBe(0);
    });

    it('does not let a player in a tournament be deleted', async () => {
        const { players } = await savedTournament();
        await expect(pool.query('DELETE FROM players WHERE id = $1', [players[0]])).rejects.toThrow(/foreign key/);
    });
});

describe('third place match', () => {
    it('saves and loads a single elimination bracket with a third place match', async () => {
        const { eventId, players } = await activeEvent(6);
        const bracket = generateBracket({
            format: 'single_elimination',
            players,
            seeding: { method: 'random', seed: 5 },
            thirdPlaceMatch: true,
            rounds: { 'third_place-1': { bestOf: 3, ruleFile: 'bronze.lua' } },
        });
        const result = await saveTournament(pool, eventId, { name: 'Bronze cup', seeding: 'random', randomSeed: 5, bracket });
        if (!result.ok) throw new Error(result.error);
        const saved = await getTournament(pool, result.id);
        expect(saved).toMatchObject({ thirdPlaceMatch: true });
        expect(asPlanned(saved!)).toEqual(bracket.matches.map(({ id, section, round, position, bestOf, ruleFile, players, winnerTo, loserTo }) => ({ id, section, round, position, bestOf, ruleFile, players, winnerTo, loserTo })));
        expect(saved!.matches.at(-1)).toMatchObject({ section: 'third_place', bestOf: 3, ruleFile: 'bronze.lua' });
    });

    it('is stored as off when not asked for, and only single elimination may have it', async () => {
        const { eventId, players } = await activeEvent(4);
        const result = await saveTournament(pool, eventId, { name: 'Cup', seeding: 'random', randomSeed: 1, bracket: plan('double_elimination', players) });
        if (!result.ok) throw new Error(result.error);
        expect(await getTournament(pool, result.id)).toMatchObject({ thirdPlaceMatch: false });
        await expect(pool.query('UPDATE tournaments SET third_place_match = true WHERE id = $1', [result.id])).rejects.toThrow(/check/);
    });
});
