// Reads the stats of games. Only the stats of a game the game server reported to the end count. A
// game an admin set or restarted has no stats, even if rows are left from an earlier report.
// Totals add the raw numbers first and divide after.
import type { Pool } from 'pg';
import type { GameStats, PlayerGameStats } from '@/lib/game-server/stats';
import { trainingBotName } from '@/lib/training/settings';
import { BOT_PLAYER_ID } from './training';

/** matches: tournament and 1v1 games. training: games against a bot. all: both. */
export type StatsScope = 'matches' | 'training' | 'all';

export interface StatTotals {
    /** The games with stats that count. */
    games: number;
    /** The share of the ball steps with the player, from 0 to 1. Null without games. */
    possession: number | null;
    touchesPerGame: number | null;
    errorsPerGame: number | null;
    netHits: number;
    longestRally: number | null;
    /** The touches of a rally on average. Null without rallies. */
    averageRally: number | null;
}

/** One game seen from one player. */
interface OwnGame {
    own: PlayerGameStats;
    opponent: { ballSteps: number };
    rallies: number;
    longestRally: number;
    rallyTouches: number;
}

const divide = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function totalsOf(games: OwnGame[]): StatTotals {
    const sum = (pick: (g: OwnGame) => number) => games.reduce((total, g) => total + pick(g), 0);
    const ownSteps = sum((g) => g.own.ballSteps);
    return {
        games: games.length,
        possession: divide(ownSteps, ownSteps + sum((g) => g.opponent.ballSteps)),
        touchesPerGame: divide(sum((g) => g.own.touches), games.length),
        errorsPerGame: divide(sum((g) => g.own.errors), games.length),
        netHits: sum((g) => g.own.netHits),
        longestRally: games.length > 0 ? Math.max(...games.map((g) => g.longestRally)) : null,
        averageRally: divide(sum((g) => g.rallyTouches), sum((g) => g.rallies)),
    };
}

interface StatRow {
    slot: number;
    ball_steps: string;
    touches: number;
    errors: number;
    net_hits: number;
    rallies: number;
    longest_rally: number;
    rally_touches: number;
}

const playerOf = (playerId: number, r: StatRow): PlayerGameStats => ({ playerId, ballSteps: Number(r.ball_steps), touches: r.touches, errors: r.errors, netHits: r.net_hits });

const STAT_COLUMNS = 's.slot, s.ball_steps, s.touches, s.errors, s.net_hits, s.rallies, s.longest_rally, s.rally_touches';

/** The games of a player in matches whose stats count, with the player and the opponent. */
async function matchGames(pool: Pool, playerId: number): Promise<OwnGame[]> {
    const { rows } = await pool.query<StatRow & { opponent_steps: string }>(
        `SELECT ${STAT_COLUMNS}, o.ball_steps AS opponent_steps
         FROM match_game_stats s
         JOIN match_game_stats o ON o.match_id = s.match_id AND o.game_number = s.game_number AND o.slot = 3 - s.slot
         JOIN match_games g ON g.match_id = s.match_id AND g.number = s.game_number
         JOIN matches m ON m.id = s.match_id
         WHERE g.source = 'server' AND g.status = 'finished'
           AND ((s.slot = 1 AND m.player1_id = $1) OR (s.slot = 2 AND m.player2_id = $1))`,
        [playerId],
    );
    return rows.map((r) => ({
        own: playerOf(playerId, r),
        opponent: { ballSteps: Number(r.opponent_steps) },
        rallies: r.rallies,
        longestRally: r.longest_rally,
        rallyTouches: r.rally_touches,
    }));
}

/** The games of a player against bots that are finished and have stats. */
async function trainingGames(pool: Pool, playerId: number): Promise<OwnGame[]> {
    const { rows } = await pool.query<{ stats: GameStats }>(`SELECT stats FROM training_matches WHERE player_id = $1 AND state = 'finished' AND stats IS NOT NULL`, [playerId]);
    const games: OwnGame[] = [];
    for (const { stats } of rows) {
        const own = stats.players.find((p) => p.playerId === playerId);
        const opponent = stats.players.find((p) => p.playerId !== playerId);
        if (own && opponent) games.push({ own, opponent, rallies: stats.rallies, longestRally: stats.longestRally, rallyTouches: stats.rallyTouches });
    }
    return games;
}

/** The stat totals of a player in each scope. */
export async function getPlayerStatTotals(pool: Pool, playerId: number): Promise<Record<StatsScope, StatTotals>> {
    const [matches, training] = await Promise.all([matchGames(pool, playerId), trainingGames(pool, playerId)]);
    return { matches: totalsOf(matches), training: totalsOf(training), all: totalsOf([...matches, ...training]) };
}

export interface GameStatsView {
    game: number;
    /** The points of the two players, in the order of the players of the page. */
    points: [number, number];
    /** Null when the game has no stats that count. */
    stats: GameStats | null;
}

export interface PlayerStatLine {
    possession: number | null;
    touches: number;
    errors: number;
    netHits: number;
}

export interface MatchStatTotals {
    /** The games with stats. */
    games: number;
    players: [PlayerStatLine, PlayerStatLine];
    rallies: number;
    longestRally: number | null;
    averageRally: number | null;
}

export interface MatchStatsPage {
    kind: 'match' | 'training';
    eventId: number;
    /** The second is the bot of a training match. Null for a player that is not known yet. */
    names: [string | null, string | null];
    /** The player ids in the order of the names. The bot of a training match has id 0. */
    playerIds: [number | null, number | null];
    ruleFile: string;
    scoreToWin: number;
    /** Game speed in frames per second. */
    speed: number;
    /** Null for a training match. */
    bestOf: number | null;
    /** The bot and its difficulty. Null for a match between players. */
    bot: { name: string; difficulty: number } | null;
    state: string;
    /** How a finished match was decided. `forfeit` is a walkover. Null for training and for a match that is not finished. */
    result: 'played' | 'forfeit' | null;
    /** The series score of a match, with a score an admin set by hand. Null for training. */
    score: [number, number] | null;
    /** The finished games, and the stats of those that have them. */
    games: GameStatsView[];
    totals: MatchStatTotals;
}

function pageTotals(games: GameStatsView[]): MatchStatTotals {
    const withStats = games.flatMap((g) => (g.stats ? [g.stats] : []));
    const steps = (k: 0 | 1) => withStats.reduce((total, s) => total + s.players[k].ballSteps, 0);
    const side = (i: 0 | 1): PlayerStatLine => {
        const sum = (pick: (p: PlayerGameStats) => number) => withStats.reduce((total, s) => total + pick(s.players[i]), 0);
        return { possession: divide(steps(i), steps(0) + steps(1)), touches: sum((p) => p.touches), errors: sum((p) => p.errors), netHits: sum((p) => p.netHits) };
    };
    const rallies = withStats.reduce((total, s) => total + s.rallies, 0);
    return {
        games: withStats.length,
        players: [side(0), side(1)],
        rallies,
        longestRally: withStats.length > 0 ? Math.max(...withStats.map((s) => s.longestRally)) : null,
        averageRally: divide(withStats.reduce((total, s) => total + s.rallyTouches, 0), rallies),
    };
}

async function matchPage(pool: Pool, id: number): Promise<MatchStatsPage | null> {
    const { rows } = await pool.query<{ event_id: number; state: string; player1_id: number | null; player2_id: number | null; score1: number; score2: number; result: 'played' | 'forfeit' | null; best_of: number; rule_file: string; score_to_win: number; game_speed: number; name1: string | null; name2: string | null }>(
        `SELECT m.event_id, m.state, m.player1_id, m.player2_id, m.score1, m.score2, m.result, m.best_of, m.rule_file, m.score_to_win, m.game_speed, p1.nickname AS name1, p2.nickname AS name2
         FROM matches m
         LEFT JOIN players p1 ON p1.id = m.player1_id
         LEFT JOIN players p2 ON p2.id = m.player2_id
         WHERE m.id = $1`,
        [id],
    );
    const match = rows[0];
    if (!match) return null;
    const games = await pool.query<Partial<StatRow> & { number: number; points1: number; points2: number; counted: boolean }>(
        `SELECT g.number, g.points1, g.points2, g.source = 'server' AS counted, ${STAT_COLUMNS}
         FROM match_games g
         LEFT JOIN match_game_stats s ON s.match_id = g.match_id AND s.game_number = g.number
         WHERE g.match_id = $1 AND g.status = 'finished'
         ORDER BY g.number, s.slot`,
        [id],
    );
    const byGame = new Map<number, { points: [number, number]; counted: boolean; rows: StatRow[] }>();
    for (const r of games.rows) {
        const entry = byGame.get(r.number) ?? { points: [r.points1, r.points2] as [number, number], counted: r.counted, rows: [] };
        if (r.slot != null) entry.rows.push(r as StatRow);
        byGame.set(r.number, entry);
    }
    const views: GameStatsView[] = [...byGame].map(([game, entry]) => {
        const [first, second] = entry.rows;
        const stats: GameStats | null =
            entry.counted && first && second && match.player1_id !== null && match.player2_id !== null
                ? { players: [playerOf(match.player1_id, first), playerOf(match.player2_id, second)], rallies: first.rallies, longestRally: first.longest_rally, rallyTouches: first.rally_touches }
                : null;
        return { game, points: entry.points, stats };
    });
    return {
        kind: 'match',
        eventId: match.event_id,
        names: [match.name1, match.name2],
        playerIds: [match.player1_id, match.player2_id],
        ruleFile: match.rule_file,
        scoreToWin: match.score_to_win,
        speed: match.game_speed,
        bestOf: match.best_of,
        bot: null,
        state: match.state,
        result: match.result,
        score: [match.score1, match.score2],
        games: views,
        totals: pageTotals(views),
    };
}

async function trainingPage(pool: Pool, id: number): Promise<MatchStatsPage | null> {
    const { rows } = await pool.query<{ event_id: number; state: string; player_id: number; nickname: string; bot: string; difficulty: number; rule_file: string; score_to_win: number; game_speed: number; player_points: number | null; bot_points: number | null; stats: GameStats | null }>(
        `SELECT t.event_id, t.state, t.player_id, p.nickname, t.bot, t.difficulty, t.rule_file, t.score_to_win, t.game_speed, t.player_points, t.bot_points, t.stats
         FROM training_matches t JOIN players p ON p.id = t.player_id
         WHERE t.id = $1`,
        [id],
    );
    const t = rows[0];
    if (!t) return null;
    const finished = t.state === 'finished' && t.player_points !== null && t.bot_points !== null;
    const own = t.stats?.players.find((p) => p.playerId === t.player_id);
    const bot = t.stats?.players.find((p) => p.playerId === BOT_PLAYER_ID);
    const stats: GameStats | null = t.stats && own && bot ? { ...t.stats, players: [own, bot] } : null;
    const views: GameStatsView[] = finished ? [{ game: 1, points: [t.player_points!, t.bot_points!], stats }] : [];
    return {
        kind: 'training',
        eventId: t.event_id,
        names: [t.nickname, trainingBotName(t.bot, t.difficulty)],
        playerIds: [t.player_id, BOT_PLAYER_ID],
        ruleFile: t.rule_file,
        scoreToWin: t.score_to_win,
        speed: t.game_speed,
        bestOf: null,
        bot: { name: t.bot, difficulty: t.difficulty },
        state: t.state,
        result: null,
        score: null,
        games: views,
        totals: pageTotals(views),
    };
}

/** The stats page of a match or of a training match. They share one sequence of ids. Null when the id is neither. */
export async function getMatchStats(pool: Pool, id: number): Promise<MatchStatsPage | null> {
    return (await matchPage(pool, id)) ?? (await trainingPage(pool, id));
}
