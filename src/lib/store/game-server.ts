// What the game server reads and the live score it sends. Results go through matches.ts.
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { DEFAULT_NEXT_GAME_DELAY } from '@/lib/matches/settings';
import type { MatchState } from '@/lib/matches/state';

export interface SyncPlayer {
    playerId: number;
    nickname: string;
    code: string;
}

export interface SyncMatch {
    matchId: number;
    state: 'called' | 'started';
    bestOf: number;
    /** The number the next game must be reported with. */
    nextGame: number;
    ruleFile: string;
    scoreToWin: number;
    speed: number;
    /** The pause in seconds before the next game of the series. From the tournament, or the default for a 1v1 match. */
    nextGameDelay: number;
    /** The last game was abandoned and waits for the admin to restart or award it. */
    awaitingDecision: boolean;
    /** The games player 1 and player 2 have won in the series, with the results an admin entered, corrected or set by hand. */
    wins1: number;
    wins2: number;
    /** Player 1 first. */
    players: [{ playerId: number; code: string }, { playerId: number; code: string }];
}

export interface ServerSync {
    serverTime: string;
    /** Changes whenever anything else in the sync changes. */
    syncVersion: string;
    /** Null when no event is active. */
    eventId: number | null;
    players: SyncPlayer[];
    matches: SyncMatch[];
}

/** The number the next game gets and whether the last game waits for the admin, worked out like getMatch does. */
const GAME_STATE = `
    greatest(m.game_base, coalesce(lg.number, 0)) + 1 AS next_game,
    (m.state = 'started' AND lg.number IS NOT NULL AND lg.number > m.game_base AND lg.status = 'abandoned' AND lg.source = 'server') AS awaiting_decision`;

/** A called or started match as the sync query reads it. */
export interface SyncMatchRow {
    id: number;
    state: 'called' | 'started';
    best_of: number;
    rule_file: string;
    score_to_win: number;
    game_speed: number;
    next_game_delay: number;
    player1_id: number;
    player2_id: number;
    code1: string;
    code2: string;
    next_game: number;
    awaiting_decision: boolean;
    score1: number;
    score2: number;
}

/** A match of the sync. The wins are the stored series score, which already counts admin results and a score set by hand. */
export function toSyncMatch(m: SyncMatchRow): SyncMatch {
    return {
        matchId: m.id,
        state: m.state,
        bestOf: m.best_of,
        nextGame: m.next_game,
        ruleFile: m.rule_file,
        scoreToWin: m.score_to_win,
        speed: m.game_speed,
        nextGameDelay: m.next_game_delay,
        awaitingDecision: m.awaiting_decision,
        wins1: m.score1,
        wins2: m.score2,
        players: [
            { playerId: m.player1_id, code: m.code1 },
            { playerId: m.player2_id, code: m.code2 },
        ],
    };
}

const LAST_GAME = `LEFT JOIN LATERAL (SELECT number, status, source FROM match_games g WHERE g.match_id = m.id ORDER BY number DESC LIMIT 1) lg ON true`;

/**
 * Everything the game server needs: the players of the active event with their join codes, and
 * every called or started match. It reads in one snapshot, so the players and matches agree.
 */
export async function getServerSync(pool: Pool, now: Date): Promise<ServerSync> {
    const client = await pool.connect();
    let content: Omit<ServerSync, 'serverTime' | 'syncVersion'>;
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try {
            const event = await client.query<{ id: number }>('SELECT id FROM events WHERE is_active');
            const eventId = event.rows[0]?.id ?? null;
            const players =
                eventId === null
                    ? []
                    : (await client.query<{ id: number; nickname: string; join_code: string }>('SELECT id, nickname, join_code FROM players WHERE event_id = $1 ORDER BY id', [eventId])).rows;
            const matches =
                eventId === null
                    ? []
                    : (
                          await client.query<SyncMatchRow>(
                              `SELECT m.id, m.state, m.best_of, m.rule_file, m.score_to_win, m.game_speed, m.player1_id, m.player2_id, m.score1, m.score2,
                                   coalesce(t.next_game_delay, ${DEFAULT_NEXT_GAME_DELAY}) AS next_game_delay,
                                   p1.join_code AS code1, p2.join_code AS code2, ${GAME_STATE}
                               FROM matches m
                               JOIN players p1 ON p1.id = m.player1_id
                               JOIN players p2 ON p2.id = m.player2_id
                               LEFT JOIN tournaments t ON t.id = m.tournament_id
                               ${LAST_GAME}
                               WHERE m.event_id = $1 AND m.state IN ('called', 'started')
                               ORDER BY m.id`,
                              [eventId],
                          )
                      ).rows;
            await client.query('COMMIT');
            content = {
                eventId,
                players: players.map((p) => ({ playerId: p.id, nickname: p.nickname, code: p.join_code })),
                matches: matches.map(toSyncMatch),
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    } finally {
        client.release();
    }
    const syncVersion = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
    return { serverTime: now.toISOString(), syncVersion, ...content };
}

export interface LiveInput {
    matchId: number;
    game: number;
    /** The points of each of the two players of the match, in any order. */
    points: readonly { playerId: number; points: number }[];
}

export type LiveResult = { status: 'stored' } | { status: 'ignored'; reason: 'not-found' | 'state' | 'players' | 'game-closed' | 'game-ahead' };

interface LiveMatchRow {
    state: MatchState;
    player1_id: number | null;
    player2_id: number | null;
    next_game: number;
}

/**
 * Stores the score of the game being played. Best effort: it never changes a result and is only
 * kept for a called or started match, and only for the next game. A score for a game that
 * already has a result, or for a later game than the next one, is ignored.
 */
export async function updateLiveScore(pool: Pool, input: LiveInput, now: Date): Promise<LiveResult> {
    const { rows } = await pool.query<LiveMatchRow>(`SELECT m.state, m.player1_id, m.player2_id, ${GAME_STATE} FROM matches m ${LAST_GAME} WHERE m.id = $1`, [input.matchId]);
    const match = rows[0];
    if (!match) return { status: 'ignored', reason: 'not-found' };
    if (match.state !== 'called' && match.state !== 'started') return { status: 'ignored', reason: 'state' };
    const ids = input.points.map((p) => p.playerId);
    if (match.player1_id === null || match.player2_id === null || ids.length !== 2 || !ids.includes(match.player1_id) || !ids.includes(match.player2_id)) {
        return { status: 'ignored', reason: 'players' };
    }
    if (input.game < match.next_game) return { status: 'ignored', reason: 'game-closed' };
    // Only the game being played is stored, so one wrong number cannot block the real game.
    if (input.game > match.next_game) return { status: 'ignored', reason: 'game-ahead' };
    const pointsOf = (playerId: number | null) => input.points.find((p) => p.playerId === playerId)!.points;
    const stored = await pool.query(
        `INSERT INTO live_scores (match_id, game_number, points1, points2, updated_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (match_id) DO UPDATE SET game_number = EXCLUDED.game_number, points1 = EXCLUDED.points1, points2 = EXCLUDED.points2, updated_at = EXCLUDED.updated_at
         WHERE live_scores.game_number <= EXCLUDED.game_number`,
        [input.matchId, input.game, pointsOf(match.player1_id), pointsOf(match.player2_id), now],
    );
    return stored.rowCount === 1 ? { status: 'stored' } : { status: 'ignored', reason: 'game-closed' };
}

export interface LiveScore {
    matchId: number;
    state: MatchState;
    /** Null when no game is being played or no score has come in for it. */
    live: { game: number; points: [{ playerId: number; points: number }, { playerId: number; points: number }]; updatedAt: string } | null;
}

/**
 * The live score of a match for the big screen. It is shown only while the match is called or
 * started and the game has no result yet. Returns null when the match does not exist.
 */
export async function getLiveScore(pool: Pool, matchId: number): Promise<LiveScore | null> {
    const { rows } = await pool.query<LiveMatchRow & { game_number: number | null; points1: number | null; points2: number | null; updated_at: Date | null }>(
        `SELECT m.state, m.player1_id, m.player2_id, ${GAME_STATE}, ls.game_number, ls.points1, ls.points2, ls.updated_at
         FROM matches m ${LAST_GAME} LEFT JOIN live_scores ls ON ls.match_id = m.id
         WHERE m.id = $1`,
        [matchId],
    );
    const row = rows[0];
    if (!row) return null;
    const showing = (row.state === 'called' || row.state === 'started') && row.game_number !== null && row.game_number >= row.next_game && row.player1_id !== null && row.player2_id !== null;
    return {
        matchId,
        state: row.state,
        live: showing
            ? {
                  game: row.game_number!,
                  points: [
                      { playerId: row.player1_id!, points: row.points1! },
                      { playerId: row.player2_id!, points: row.points2! },
                  ],
                  updatedAt: row.updated_at!.toISOString(),
              }
            : null,
    };
}
