// Training matches against a bot that the game server runs. They live in their own table, so they
// never reach Foza, bets, the leaderboards, Elo, tournaments or the big screen. A training match
// is one game. The game server reports it like a match, with player id 0 for the bot.
import type { Pool, PoolClient } from 'pg';
import { realScoreToWin } from '@/lib/matches/rules';
import { isScoreToWin, isWinningScore } from '@/lib/matches/settings';
import { TRAINING_SPEED, isDifficulty, isTrainingBot, isTrainingRules, type TrainingOptions } from '@/lib/training/settings';
import { lockEventMatches } from './matches';
import { inTransaction } from './transaction';

/** The player id the game server uses for its bot. */
export const BOT_PLAYER_ID = 0;

export type TrainingState = 'called' | 'started' | 'finished' | 'cancelled';
export type TrainingCancelReason = 'player' | 'left' | 'replaced';

export interface TrainingMatch {
    id: number;
    eventId: number;
    playerId: number;
    bot: string;
    difficulty: number;
    ruleFile: string;
    scoreToWin: number;
    speed: number;
    state: TrainingState;
    cancelReason: TrainingCancelReason | null;
    playerPoints: number | null;
    botPoints: number | null;
    won: boolean | null;
    createdAt: Date;
}

interface TrainingRow {
    id: number;
    event_id: number;
    player_id: number;
    bot: string;
    difficulty: number;
    rule_file: string;
    score_to_win: number;
    game_speed: number;
    state: TrainingState;
    cancel_reason: TrainingCancelReason | null;
    player_points: number | null;
    bot_points: number | null;
    won: boolean | null;
    created_at: Date;
}

const COLUMNS = 'id, event_id, player_id, bot, difficulty, rule_file, score_to_win, game_speed, state, cancel_reason, player_points, bot_points, won, created_at';

const toTraining = (r: TrainingRow): TrainingMatch => ({
    id: r.id,
    eventId: r.event_id,
    playerId: r.player_id,
    bot: r.bot,
    difficulty: r.difficulty,
    ruleFile: r.rule_file,
    scoreToWin: r.score_to_win,
    speed: r.game_speed,
    state: r.state,
    cancelReason: r.cancel_reason,
    playerPoints: r.player_points,
    botPoints: r.bot_points,
    won: r.won,
    createdAt: r.created_at,
});

export type TrainingError =
    /** The bot, the difficulty, the rules or the points to win are not valid. */
    | 'settings'
    /** The player is not in the active event. */
    | 'no-event'
    /** The player is in a called or started match. */
    | 'player-busy'
    /** The player already has an open training match. */
    | 'taken'
    /** No open training match of this player. */
    | 'not-found';

const isOpen = (state: TrainingState) => state === 'called' || state === 'started';

/**
 * Starts a training match for a signed in player of the active event. The game server starts it
 * when the player joins. A player has one live match at a time, so a player in a called or started
 * match cannot train, and a player has one open training match.
 */
export async function createTraining(pool: Pool, playerId: number, options: TrainingOptions): Promise<{ ok: true; id: number } | { ok: false; error: TrainingError }> {
    if (!isTrainingBot(options.bot) || !isDifficulty(options.difficulty) || !isScoreToWin(options.scoreToWin) || !isTrainingRules(options.ruleFile, options.scoreToWin)) return { ok: false, error: 'settings' };
    const found = await pool.query<{ event_id: number }>('SELECT event_id FROM players WHERE id = $1', [playerId]);
    const eventId = found.rows[0]?.event_id;
    if (eventId === undefined) return { ok: false, error: 'no-event' };
    return inTransaction(pool, async (client) => {
        // The same locks as a match change, in the same order: the event, then the player. So a call
        // of a match and this cannot both see the player free.
        await lockEventMatches(client, eventId);
        await client.query('SELECT 1 FROM players WHERE id = $1 FOR NO KEY UPDATE', [playerId]);
        const active = await client.query('SELECT 1 FROM events WHERE id = $1 AND is_active', [eventId]);
        if (active.rowCount !== 1) return { ok: false as const, error: 'no-event' as const };
        const busy = await client.query(`SELECT 1 FROM matches WHERE state IN ('called', 'started') AND (player1_id = $1 OR player2_id = $1) LIMIT 1`, [playerId]);
        if ((busy.rowCount ?? 0) > 0) return { ok: false as const, error: 'player-busy' as const };
        const inserted = await client.query<{ id: number }>(
            `INSERT INTO training_matches (event_id, player_id, bot, difficulty, rule_file, score_to_win, game_speed) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING RETURNING id`,
            [eventId, playerId, options.bot, options.difficulty, options.ruleFile, options.scoreToWin, TRAINING_SPEED],
        );
        if (inserted.rowCount === 0) return { ok: false as const, error: 'taken' as const };
        return { ok: true as const, id: inserted.rows[0].id };
    });
}

/** The player stops their open training match. The game server drops it at its next sync. */
export async function cancelTraining(pool: Pool, playerId: number, id: number): Promise<{ ok: true } | { ok: false; error: 'not-found' }> {
    const { rowCount } = await pool.query(
        `UPDATE training_matches SET state = 'cancelled', cancel_reason = 'player', cancelled_at = now()
         WHERE id = $1 AND player_id = $2 AND state IN ('called', 'started')`,
        [id, playerId],
    );
    return rowCount === 1 ? { ok: true } : { ok: false, error: 'not-found' };
}

/**
 * Ends the open training matches of players who were just called to a real match, in the
 * transaction that calls it. A player has one live match at a time, and the real one comes first.
 */
export async function replaceTraining(client: PoolClient, playerIds: readonly number[]): Promise<void> {
    if (playerIds.length === 0) return;
    await client.query(
        `UPDATE training_matches SET state = 'cancelled', cancel_reason = 'replaced', cancelled_at = now()
         WHERE player_id = ANY($1::int[]) AND state IN ('called', 'started')`,
        [playerIds],
    );
}

/** The open training match of a player, or null. */
export async function getOpenTraining(pool: Pool, playerId: number): Promise<TrainingMatch | null> {
    const { rows } = await pool.query<TrainingRow>(`SELECT ${COLUMNS} FROM training_matches WHERE player_id = $1 AND state IN ('called', 'started')`, [playerId]);
    return rows[0] ? toTraining(rows[0]) : null;
}

/** The last training matches of a player, newest first. */
export async function listRecentTraining(pool: Pool, playerId: number, limit = 10): Promise<TrainingMatch[]> {
    const { rows } = await pool.query<TrainingRow>(`SELECT ${COLUMNS} FROM training_matches WHERE player_id = $1 ORDER BY id DESC LIMIT $2`, [playerId, limit]);
    return rows.map(toTraining);
}

// The game server

/** An open training match as the sync query reads it. */
export interface SyncTrainingRow {
    id: number;
    state: 'called' | 'started';
    player_id: number;
    code: string;
    bot: string;
    difficulty: number;
    rule_file: string;
    score_to_win: number;
    game_speed: number;
}

/** The open training matches of an event for the sync of the game server, in the snapshot of the sync. */
export async function listSyncTraining(client: PoolClient, eventId: number): Promise<SyncTrainingRow[]> {
    const { rows } = await client.query<SyncTrainingRow>(
        `SELECT t.id, t.state, t.player_id, p.join_code AS code, t.bot, t.difficulty, t.rule_file, t.score_to_win, t.game_speed
         FROM training_matches t JOIN players p ON p.id = t.player_id
         WHERE t.event_id = $1 AND t.state IN ('called', 'started')
         ORDER BY t.id`,
        [eventId],
    );
    return rows;
}

/** True when the id is a training match. The game server reports both kinds to the same routes. */
export async function isTrainingMatch(pool: Pool, id: number): Promise<boolean> {
    const { rowCount } = await pool.query('SELECT 1 FROM training_matches WHERE id = $1', [id]);
    return rowCount === 1;
}

export type TrainingConnected = { ok: true; started: boolean } | { ok: false; error: 'not-found' | 'players' | 'state' };

/** The player of a training match joined. The match starts. The ids are the player and 0 for the bot. */
export async function reportTrainingConnected(pool: Pool, id: number, playerIds: readonly number[]): Promise<TrainingConnected> {
    return inTransaction(pool, async (client) => {
        const { rows } = await client.query<TrainingRow>(`SELECT ${COLUMNS} FROM training_matches WHERE id = $1 FOR UPDATE`, [id]);
        const match = rows[0];
        if (!match) return { ok: false as const, error: 'not-found' as const };
        if (playerIds.length !== 2 || !playerIds.includes(match.player_id) || !playerIds.includes(BOT_PLAYER_ID)) return { ok: false as const, error: 'players' as const };
        if (match.state === 'started') return { ok: true as const, started: false };
        if (match.state !== 'called') return { ok: false as const, error: 'state' as const };
        await client.query(`UPDATE training_matches SET state = 'started', started_at = now() WHERE id = $1`, [id]);
        return { ok: true as const, started: true };
    });
}

export interface TrainingReport {
    reportId: string;
    matchId: number;
    game: number;
    status: 'finished' | 'abandoned';
    /** The player id, or 0 when the bot won. Null for an abandoned game. */
    winnerId: number | null;
    /** The points of the player and of the bot, which has id 0. */
    points: readonly { playerId: number; points: number }[];
    startedAt: Date;
    endedAt: Date;
}

export type TrainingReportResult =
    | { status: 'stored' }
    | { status: 'duplicate' }
    | { status: 'game-closed' }
    | { status: 'refused'; reason: 'not-found' | 'players' | 'state' | 'game-ahead' | 'score' };

/**
 * Stores the game of a training match. A finished game finishes the match and counts in the
 * training stats. An abandoned game, when the player left, ends the match without a result.
 */
export async function reportTrainingGame(pool: Pool, report: TrainingReport): Promise<TrainingReportResult> {
    return inTransaction(pool, async (client): Promise<TrainingReportResult> => {
        const { rows } = await client.query<TrainingRow & { report_id: string | null }>(`SELECT ${COLUMNS}, report_id FROM training_matches WHERE id = $1 FOR UPDATE`, [report.matchId]);
        const match = rows[0];
        if (!match) return { status: 'refused', reason: 'not-found' };
        if (match.report_id === report.reportId) return { status: 'duplicate' };
        const ids = report.points.map((p) => p.playerId);
        if (ids.length !== 2 || !ids.includes(match.player_id) || !ids.includes(BOT_PLAYER_ID)) return { status: 'refused', reason: 'players' };
        if (report.winnerId !== null && !ids.includes(report.winnerId)) return { status: 'refused', reason: 'players' };
        if (report.game > 1) return { status: 'refused', reason: 'game-ahead' };
        if (!isOpen(match.state)) return match.state === 'finished' ? { status: 'game-closed' } : { status: 'refused', reason: 'state' };
        const playerPoints = report.points.find((p) => p.playerId === match.player_id)!.points;
        const botPoints = report.points.find((p) => p.playerId === BOT_PLAYER_ID)!.points;
        if (report.status === 'abandoned') {
            await client.query(
                `UPDATE training_matches SET state = 'cancelled', cancel_reason = 'left', cancelled_at = now(), report_id = $2, game_started_at = $3
                 WHERE id = $1`,
                [match.id, report.reportId, report.startedAt],
            );
            return { status: 'stored' };
        }
        const won = report.winnerId === match.player_id;
        // Lyn always plays to 2 and Brannmur to 10 times the points, like for a match.
        if (!isWinningScore(won ? 1 : 2, playerPoints, botPoints, realScoreToWin(match.rule_file, match.score_to_win))) return { status: 'refused', reason: 'score' };
        await client.query(
            `UPDATE training_matches SET state = 'finished', finished_at = now(), started_at = coalesce(started_at, $3), report_id = $2,
                 player_points = $4, bot_points = $5, won = $6, game_started_at = $3, game_ended_at = $7
             WHERE id = $1`,
            [match.id, report.reportId, report.startedAt, playerPoints, botPoints, won, report.endedAt],
        );
        return { status: 'stored' };
    });
}

// Stats. They count finished training games only, and never mix with the real stats.

export interface TrainingRecord {
    bot: string;
    difficulty: number;
    games: number;
    wins: number;
    losses: number;
}

export interface PlayerTrainingStats {
    games: number;
    wins: number;
    losses: number;
    /** Per bot and difficulty, the most played first. */
    records: TrainingRecord[];
    /** The strongest bot the player has beaten: the lowest difficulty, then the bot name. Null before the first win. */
    hardestBeaten: { bot: string; difficulty: number } | null;
}

/** The training stats of one player. */
export async function getPlayerTrainingStats(pool: Pool, playerId: number): Promise<PlayerTrainingStats> {
    const { rows } = await pool.query<{ bot: string; difficulty: number; games: number; wins: number }>(
        `SELECT bot, difficulty, count(*)::int AS games, count(*) FILTER (WHERE won)::int AS wins
         FROM training_matches WHERE player_id = $1 AND state = 'finished'
         GROUP BY bot, difficulty
         ORDER BY games DESC, difficulty, bot`,
        [playerId],
    );
    const records = rows.map((r) => ({ bot: r.bot, difficulty: r.difficulty, games: r.games, wins: r.wins, losses: r.games - r.wins }));
    const beaten = records.filter((r) => r.wins > 0).sort((a, b) => a.difficulty - b.difficulty || a.bot.localeCompare(b.bot))[0];
    const games = records.reduce((sum, r) => sum + r.games, 0);
    const wins = records.reduce((sum, r) => sum + r.wins, 0);
    return { games, wins, losses: games - wins, records, hardestBeaten: beaten ? { bot: beaten.bot, difficulty: beaten.difficulty } : null };
}

export interface TrainerEntry {
    playerId: number;
    nickname: string;
    games: number;
    wins: number;
}

export interface BotEntry {
    bot: string;
    games: number;
    /** Games the players won against the bot. */
    playerWins: number;
}

export interface TrainingOverview {
    /** Who trains the most: most games, then most wins, then nickname. */
    trainers: TrainerEntry[];
    /** The most played bots first. */
    bots: BotEntry[];
    /** Wins against each bot per difficulty, by bot and then from the strongest difficulty. */
    records: TrainingRecord[];
}

/** The public training overview of an event. */
export async function getTrainingOverview(pool: Pool, eventId: number): Promise<TrainingOverview> {
    const [trainers, records] = await Promise.all([
        pool.query<{ player_id: number; nickname: string; games: number; wins: number }>(
            `SELECT t.player_id, p.nickname, count(*)::int AS games, count(*) FILTER (WHERE t.won)::int AS wins
             FROM training_matches t JOIN players p ON p.id = t.player_id
             WHERE t.event_id = $1 AND t.state = 'finished'
             GROUP BY t.player_id, p.nickname
             ORDER BY games DESC, wins DESC, lower(p.nickname), t.player_id`,
            [eventId],
        ),
        pool.query<{ bot: string; difficulty: number; games: number; wins: number }>(
            `SELECT bot, difficulty, count(*)::int AS games, count(*) FILTER (WHERE won)::int AS wins
             FROM training_matches WHERE event_id = $1 AND state = 'finished'
             GROUP BY bot, difficulty
             ORDER BY bot, difficulty`,
            [eventId],
        ),
    ]);
    const perBot = new Map<string, BotEntry>();
    for (const r of records.rows) {
        const entry = perBot.get(r.bot) ?? { bot: r.bot, games: 0, playerWins: 0 };
        entry.games += r.games;
        entry.playerWins += r.wins;
        perBot.set(r.bot, entry);
    }
    return {
        trainers: trainers.rows.map((r) => ({ playerId: r.player_id, nickname: r.nickname, games: r.games, wins: r.wins })),
        bots: [...perBot.values()].sort((a, b) => b.games - a.games || a.bot.localeCompare(b.bot)),
        records: records.rows.map((r) => ({ bot: r.bot, difficulty: r.difficulty, games: r.games, wins: r.wins, losses: r.games - r.wins })),
    };
}

export interface LiveTraining {
    id: number;
    playerId: number;
    nickname: string;
    bot: string;
    difficulty: number;
    ruleFile: string;
    scoreToWin: number;
    /** called while the game server waits for the player, started while the game runs. */
    state: 'called' | 'started';
}

/** The open training matches of an event, for the list of what is in the ring. Oldest first. */
export async function listLiveTraining(pool: Pool, eventId: number): Promise<LiveTraining[]> {
    const { rows } = await pool.query<{ id: number; player_id: number; nickname: string; bot: string; difficulty: number; rule_file: string; score_to_win: number; state: 'called' | 'started' }>(
        `SELECT t.id, t.player_id, p.nickname, t.bot, t.difficulty, t.rule_file, t.score_to_win, t.state
         FROM training_matches t JOIN players p ON p.id = t.player_id
         WHERE t.event_id = $1 AND t.state IN ('called', 'started')
         ORDER BY t.id`,
        [eventId],
    );
    return rows.map((r) => ({ id: r.id, playerId: r.player_id, nickname: r.nickname, bot: r.bot, difficulty: r.difficulty, ruleFile: r.rule_file, scoreToWin: r.score_to_win, state: r.state }));
}
