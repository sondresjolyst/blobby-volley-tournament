import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../scripts/migrate.mjs';
import type { EventInput } from '@/lib/events/input';
import { newJoinCode } from '@/lib/players/join-code';
import type { TrainingOptions } from '@/lib/training/settings';
import { withAccount } from './db-test-sql';
import { createEvent, setActiveEvent } from './events';
import { listEventGames, listEventGamesPage } from './game-list';
import { getMatchStats } from './game-stats';
import { acceptChallenge, cancelMatch, createChallenge, recordNoShow, reportServerGame } from './matches';
import { createTraining, reportTrainingConnected, reportTrainingGame } from './training';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const LAN: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 0 };
const OPTIONS: TrainingOptions = { bot: 'hyp014', difficulty: 13, ruleFile: 'default.lua', scoreToWin: 15 };

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

let uuids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++uuids).padStart(12, '0')}`;

async function addPlayer(eventId: number, nickname: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
        `${withAccount()} INSERT INTO players (account_id, event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, join_code)
         VALUES ((SELECT id FROM account), $1, $2, $3, '\\x00', '\\x00', 0, $4) RETURNING id`,
        [eventId, nickname, nickname.toLowerCase(), newJoinCode()],
    );
    return rows[0].id;
}

/** A called 1v1 match to three games. */
async function match(a: number, b: number): Promise<number> {
    const challenge = await createChallenge(pool, a, b, { bestOf: 3 });
    if (!challenge.ok) throw new Error(challenge.error);
    const accepted = await acceptChallenge(pool, challenge.matchId, b);
    if (!accepted.ok) throw new Error(accepted.error);
    return challenge.matchId;
}

async function win(matchId: number, game: number, winner: number, loser: number): Promise<void> {
    const result = await reportServerGame(pool, {
        reportId: uuid(),
        matchId,
        game,
        winnerId: winner,
        points: [
            { playerId: winner, points: 15 },
            { playerId: loser, points: 7 },
        ],
        stats: null,
        startedAt: new Date('2026-11-20T18:00:00Z'),
        endedAt: new Date('2026-11-20T18:05:00Z'),
    });
    expect(result).toMatchObject({ ok: true });
}

async function train(playerId: number, finish: boolean): Promise<number> {
    const created = await createTraining(pool, playerId, OPTIONS);
    if (!created.ok) throw new Error(created.error);
    await reportTrainingConnected(pool, created.id, [playerId, 0]);
    if (finish) {
        const result = await reportTrainingGame(pool, {
            reportId: uuid(),
            matchId: created.id,
            game: 1,
            status: 'finished',
            winnerId: playerId,
            points: [
                { playerId, points: 15 },
                { playerId: 0, points: 4 },
            ],
            stats: null,
            startedAt: new Date('2026-11-20T18:00:00Z'),
            endedAt: new Date('2026-11-20T18:03:00Z'),
        });
        expect(result).toEqual({ status: 'stored' });
    }
    return created.id;
}

async function setup() {
    const eventId = await createEvent(pool, LAN);
    await setActiveEvent(pool, eventId);
    const bob = await addPlayer(eventId, 'Bob');
    const kevin = await addPlayer(eventId, 'Kevin');
    const pia = await addPlayer(eventId, 'Pia');
    const ida = await addPlayer(eventId, 'Ida');
    return { eventId, bob, kevin, pia, ida };
}

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

describe('listEventGames', () => {
    it('lists_matches_and_training_newest_first', async () => {
        const s = await setup();
        const first = await match(s.bob, s.kevin);
        await win(first, 1, s.bob, s.kevin);
        await win(first, 2, s.bob, s.kevin);
        const training = await train(s.bob, true);
        const second = await match(s.pia, s.kevin);
        await win(second, 1, s.pia, s.kevin);
        const running = await train(s.ida, false);
        await pool.query(`UPDATE matches SET finished_at = '2026-11-20T18:10:00Z' WHERE id = $1`, [first]);
        await pool.query(`UPDATE training_matches SET finished_at = '2026-11-20T19:00:00Z' WHERE id = $1`, [training]);

        const rows = await listEventGames(pool, s.eventId, {});
        expect(rows.map((r) => r.id)).toEqual([running, second, training, first]);
        expect(rows.map((r) => r.kind)).toEqual(['training', '1v1', 'training', '1v1']);
        expect(rows[0]).toMatchObject({ names: ['Ida', 'Bot (hyp014, vanskegrad 13)'], playerIds: [s.ida, 0], score: null, running: true, ruleFile: 'default.lua' });
        expect(rows[1]).toMatchObject({ running: true, score: [1, 0] });
        expect(rows[2]).toMatchObject({ score: [15, 4], running: false });
        expect(rows[3]).toMatchObject({ names: ['Bob', 'Kevin'], playerIds: [s.bob, s.kevin], score: [2, 0], running: false });
    });

    it('leaves_out_called_and_cancelled_games', async () => {
        const s = await setup();
        await match(s.bob, s.pia);
        const cancelled = await match(s.bob, s.kevin);
        expect((await cancelMatch(pool, cancelled)).ok).toBe(true);
        expect(await listEventGames(pool, s.eventId, {})).toEqual([]);
    });

    it('filter_by_two_players_shows_only_their_matches', async () => {
        const s = await setup();
        await train(s.bob, true);
        const a = await match(s.bob, s.kevin);
        await win(a, 1, s.bob, s.kevin);
        const b = await match(s.pia, s.kevin);
        await win(b, 1, s.pia, s.kevin);

        expect((await listEventGames(pool, s.eventId, { playerId: s.bob, opponentId: s.kevin })).map((r) => r.id)).toEqual([a]);
        expect((await listEventGames(pool, s.eventId, { playerId: s.kevin, opponentId: s.bob })).map((r) => r.id)).toEqual([a]);
        expect(await listEventGames(pool, s.eventId, { playerId: s.pia, opponentId: s.bob })).toEqual([]);
    });

    it('filter_by_one_player_includes_training', async () => {
        const s = await setup();
        const t = await train(s.bob, true);
        const a = await match(s.bob, s.kevin);
        await win(a, 1, s.bob, s.kevin);
        const b = await match(s.pia, s.kevin);
        await win(b, 1, s.pia, s.kevin);
        expect(sorted((await listEventGames(pool, s.eventId, { playerId: s.bob })).map((r) => r.id))).toEqual(sorted([a, t]));
    });

    it('unknown_ids_show_the_full_list', async () => {
        const s = await setup();
        const a = await match(s.bob, s.kevin);
        await win(a, 1, s.bob, s.kevin);
        const t = await train(s.pia, true);
        const all = sorted([a, t]);
        expect(sorted((await listEventGames(pool, s.eventId, {})).map((r) => r.id))).toEqual(all);
        expect(sorted((await listEventGames(pool, s.eventId, { playerId: 9999 })).map((r) => r.id))).toEqual(all);
        expect(sorted((await listEventGames(pool, s.eventId, { playerId: 9999, opponentId: s.bob })).map((r) => r.id))).toEqual(all);
        expect((await listEventGames(pool, s.eventId, { playerId: s.bob, opponentId: 9999 })).map((r) => r.id)).toEqual([a]);
    });

    it('marks_a_walkover_without_a_score', async () => {
        const s = await setup();
        const id = await match(s.bob, s.kevin);
        expect((await recordNoShow(pool, id, 2)).ok).toBe(true);
        const [row] = await listEventGames(pool, s.eventId, {});
        expect(row).toMatchObject({ id, walkover: true, running: false, score: null });
        expect(await getMatchStats(pool, id)).toMatchObject({ state: 'finished', result: 'forfeit', score: [0, 0], games: [] });
    });

    it('shows_the_series_score_of_a_running_match', async () => {
        const s = await setup();
        const id = await match(s.bob, s.kevin);
        await win(id, 1, s.bob, s.kevin);
        const [row] = await listEventGames(pool, s.eventId, {});
        expect(row).toMatchObject({ running: true, walkover: false, score: [1, 0] });
    });

    it('treats_the_same_player_as_no_opponent', async () => {
        const s = await setup();
        const id = await match(s.bob, s.kevin);
        await win(id, 1, s.bob, s.kevin);
        expect((await listEventGames(pool, s.eventId, { playerId: s.bob, opponentId: s.bob })).map((r) => r.id)).toEqual([id]);
    });
});

describe('listEventGamesPage', () => {
    /** Twelve finished 1v1 matches between Bob and Kevin, oldest first by id, one minute apart. */
    async function twelve(s: Awaited<ReturnType<typeof setup>>): Promise<number[]> {
        const ids: number[] = [];
        for (let i = 0; i < 12; i++) {
            const id = await match(s.bob, s.kevin);
            await win(id, 1, s.bob, s.kevin);
            await win(id, 2, s.bob, s.kevin);
            await pool.query(`UPDATE matches SET finished_at = $2 WHERE id = $1`, [id, new Date(Date.UTC(2026, 10, 20, 18, i))]);
            ids.push(id);
        }
        return ids;
    }

    it('reads_page_1_and_page_2_with_the_total', async () => {
        const s = await setup();
        const ids = await twelve(s);
        const newest = [...ids].reverse();
        const one = await listEventGamesPage(pool, s.eventId, {}, 1);
        expect(one.items.map((r) => r.id)).toEqual(newest.slice(0, 10));
        expect(one).toMatchObject({ page: 1, pages: 2, total: 12, first: 1, last: 10 });
        const two = await listEventGamesPage(pool, s.eventId, {}, 2);
        expect(two.items.map((r) => r.id)).toEqual(newest.slice(10));
        expect(two).toMatchObject({ page: 2, pages: 2, total: 12, first: 11, last: 12 });
    });

    it('puts_running_games_first_on_page_1', async () => {
        const s = await setup();
        const ids = await twelve(s);
        const running = await train(s.ida, false);
        const one = await listEventGamesPage(pool, s.eventId, {}, 1);
        expect(one.items[0].id).toBe(running);
        expect(one.items).toHaveLength(10);
        expect(one.total).toBe(13);
        const two = await listEventGamesPage(pool, s.eventId, {}, 2);
        expect(two.items.map((r) => r.id)).toEqual([...ids].reverse().slice(9));
    });

    it('pages_inside_a_filter', async () => {
        const s = await setup();
        await twelve(s);
        const other = await match(s.pia, s.ida);
        await win(other, 1, s.pia, s.ida);
        await train(s.bob, true);
        const filtered = await listEventGamesPage(pool, s.eventId, { playerId: s.bob, opponentId: s.kevin }, 2);
        expect(filtered).toMatchObject({ page: 2, pages: 2, total: 12 });
        expect(filtered.items).toHaveLength(2);
        const player = await listEventGamesPage(pool, s.eventId, { playerId: s.bob }, 2);
        expect(player.total).toBe(13);
        expect(player.items).toHaveLength(3);
        const unknown = await listEventGamesPage(pool, s.eventId, { playerId: 9999 }, 1);
        expect(unknown.total).toBe(14);
    });

    it('shows_the_last_page_for_a_page_past_the_end', async () => {
        const s = await setup();
        const ids = await twelve(s);
        const past = await listEventGamesPage(pool, s.eventId, {}, 99);
        expect(past).toMatchObject({ page: 2, pages: 2, total: 12, first: 11, last: 12 });
        expect(past.items.map((r) => r.id)).toEqual([...ids].reverse().slice(10));
    });

    it('gives_an_empty_first_page_when_there_are_no_games', async () => {
        const s = await setup();
        expect(await listEventGamesPage(pool, s.eventId, {}, 3)).toEqual({ items: [], page: 1, pages: 1, total: 0, first: 0, last: 0 });
    });

    it('limits_the_plain_list', async () => {
        const s = await setup();
        const ids = await twelve(s);
        const rows = await listEventGames(pool, s.eventId, { playerId: s.bob, limit: 3 });
        expect(rows.map((r) => r.id)).toEqual([...ids].reverse().slice(0, 3));
    });
});
