import type { Pool } from 'pg';
import { MAX_PLAYERS, MIN_PLAYERS, type BestOf, type FormatId, type PlannedBracket, type Section, type SeedingMethod } from '@/lib/bracket';
import { createBracketMatches } from './matches';
import { inTransaction } from './transaction';

export interface NewTournament {
    name: string;
    seeding: SeedingMethod;
    /** Set for random seeding, null otherwise. */
    randomSeed: number | null;
    bracket: PlannedBracket;
}

export interface TournamentPlayer {
    playerId: number;
    nickname: string;
    seed: number;
}

export interface SavedMatch {
    id: number;
    section: Section;
    round: number;
    position: number;
    bestOf: BestOf;
    ruleFile: string;
    players: [number | null, number | null];
    winnerTo: { matchId: number; slot: 1 | 2 } | null;
    loserTo: { matchId: number; slot: 1 | 2 } | null;
}

export interface SavedTournament {
    id: number;
    eventId: number;
    name: string;
    format: FormatId;
    seeding: SeedingMethod;
    randomSeed: number | null;
    thirdPlaceMatch: boolean;
    /** In seed order. */
    players: TournamentPlayer[];
    /** In play order. A match only links to matches later in the list. */
    matches: SavedMatch[];
}

export interface TournamentSummary {
    id: number;
    name: string;
    format: FormatId;
    playerCount: number;
}

export type SaveTournamentResult = { ok: true; id: number } | { ok: false; error: 'no-event' | 'players' };

class Abort extends Error {
    constructor(readonly reason: 'no-event' | 'players') {
        super(reason);
    }
}

/** True when the seeds are 2 to 32 different players and every player in a match is one of them. */
function seedsMatchPlayers(bracket: PlannedBracket): boolean {
    const seeds = new Set(bracket.seeds);
    if (seeds.size !== bracket.seeds.length || seeds.size < MIN_PLAYERS || seeds.size > MAX_PLAYERS) return false;
    return bracket.matches.every((m) => m.players.every((p) => p === null || seeds.has(p)));
}

/**
 * Saves a tournament and its bracket in the given event, which must be the active one. Every
 * player must belong to that event, and the seeds must fit the player count. Nothing is saved
 * when a check fails.
 */
export async function saveTournament(pool: Pool, eventId: number, input: NewTournament): Promise<SaveTournamentResult> {
    const { bracket } = input;
    if (!seedsMatchPlayers(bracket)) return { ok: false, error: 'players' };
    try {
        const id = await inTransaction(pool, async (client) => {
            // Locks the event row, so it cannot be closed while the tournament is saved.
            const event = await client.query('SELECT 1 FROM events WHERE id = $1 AND is_active FOR SHARE', [eventId]);
            if (event.rowCount !== 1) throw new Abort('no-event');
            const known = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM players WHERE event_id = $1 AND id = ANY($2::int[])', [eventId, bracket.seeds]);
            if (known.rows[0].n !== bracket.seeds.length) throw new Abort('players');

            const { rows } = await client.query<{ id: number }>(
                'INSERT INTO tournaments (event_id, name, format, seeding, random_seed, third_place_match) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [eventId, input.name, bracket.format, input.seeding, input.randomSeed, bracket.thirdPlaceMatch],
            );
            const tournamentId = rows[0].id;
            await client.query(
                `INSERT INTO tournament_players (tournament_id, event_id, player_id, seed)
                 SELECT $1, $2, player_id, seed FROM unnest($3::int[]) WITH ORDINALITY AS s (player_id, seed)`,
                [tournamentId, eventId, bracket.seeds],
            );

            // Matches are added first and linked after, because a match links to later matches.
            const dbId = new Map<number, number>();
            for (const match of bracket.matches) {
                const inserted = await client.query<{ id: number }>(
                    `INSERT INTO bracket_matches (tournament_id, section, round, position, best_of, rule_file, player1_id, player2_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                    [tournamentId, match.section, match.round, match.position, match.bestOf, match.ruleFile, match.players[0], match.players[1]],
                );
                dbId.set(match.id, inserted.rows[0].id);
            }
            for (const match of bracket.matches) {
                if (!match.winnerTo && !match.loserTo) continue;
                await client.query(
                    `UPDATE bracket_matches SET next_winner_match_id = $2, next_winner_slot = $3, next_loser_match_id = $4, next_loser_slot = $5
                     WHERE id = $1`,
                    [
                        dbId.get(match.id),
                        match.winnerTo ? dbId.get(match.winnerTo.matchId) : null,
                        match.winnerTo?.slot ?? null,
                        match.loserTo ? dbId.get(match.loserTo.matchId) : null,
                        match.loserTo?.slot ?? null,
                    ],
                );
            }
            await createBracketMatches(client, tournamentId);
            return tournamentId;
        });
        return { ok: true, id };
    } catch (error) {
        if (error instanceof Abort) return { ok: false, error: error.reason };
        throw error;
    }
}

interface MatchRecord {
    id: number;
    section: Section;
    round: number;
    position: number;
    best_of: BestOf;
    rule_file: string;
    player1_id: number | null;
    player2_id: number | null;
    next_winner_match_id: number | null;
    next_winner_slot: 1 | 2 | null;
    next_loser_match_id: number | null;
    next_loser_slot: 1 | 2 | null;
}

export async function getTournament(pool: Pool, id: number): Promise<SavedTournament | null> {
    const found = await pool.query<{ id: number; event_id: number; name: string; format: FormatId; seeding: SeedingMethod; random_seed: number | null; third_place_match: boolean }>(
        'SELECT id, event_id, name, format, seeding, random_seed, third_place_match FROM tournaments WHERE id = $1',
        [id],
    );
    const row = found.rows[0];
    if (!row) return null;
    const players = await pool.query<{ player_id: number; nickname: string; seed: number }>(
        `SELECT tp.player_id, p.nickname, tp.seed FROM tournament_players tp JOIN players p ON p.id = tp.player_id
         WHERE tp.tournament_id = $1 ORDER BY tp.seed`,
        [id],
    );
    // The ids follow the insert order, which is the play order.
    const matches = await pool.query<MatchRecord>(
        `SELECT id, section, round, position, best_of, rule_file, player1_id, player2_id,
             next_winner_match_id, next_winner_slot, next_loser_match_id, next_loser_slot
         FROM bracket_matches WHERE tournament_id = $1 ORDER BY id`,
        [id],
    );
    return {
        id: row.id,
        eventId: row.event_id,
        name: row.name,
        format: row.format,
        seeding: row.seeding,
        randomSeed: row.random_seed,
        thirdPlaceMatch: row.third_place_match,
        players: players.rows.map((p) => ({ playerId: p.player_id, nickname: p.nickname, seed: p.seed })),
        matches: matches.rows.map((m) => ({
            id: m.id,
            section: m.section,
            round: m.round,
            position: m.position,
            bestOf: m.best_of,
            ruleFile: m.rule_file,
            players: [m.player1_id, m.player2_id],
            winnerTo: m.next_winner_match_id === null ? null : { matchId: m.next_winner_match_id, slot: m.next_winner_slot! },
            loserTo: m.next_loser_match_id === null ? null : { matchId: m.next_loser_match_id, slot: m.next_loser_slot! },
        })),
    };
}

/** The tournaments of an event, the newest first. */
export async function listTournaments(pool: Pool, eventId: number): Promise<TournamentSummary[]> {
    const { rows } = await pool.query<{ id: number; name: string; format: FormatId; player_count: number }>(
        `SELECT t.id, t.name, t.format, (SELECT count(*)::int FROM tournament_players tp WHERE tp.tournament_id = t.id) AS player_count
         FROM tournaments t WHERE t.event_id = $1 ORDER BY t.id DESC`,
        [eventId],
    );
    return rows.map((row) => ({ id: row.id, name: row.name, format: row.format, playerCount: row.player_count }));
}
