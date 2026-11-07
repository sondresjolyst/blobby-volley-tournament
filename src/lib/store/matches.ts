// Every change to a match goes through this module. Each change runs in one transaction and passes
// what happened to handleMatchEvents before it commits, so betting can settle and refund in the
// same transaction.
import type { Pool, PoolClient } from 'pg';
import { DEFAULT_RULES, finalPlacings, isBestOf, isRuleFile, roundName, type FormatId, type MatchLink, type Placing, type Section } from '@/lib/bracket';
import { DEFAULT_GAME_SPEED, DEFAULT_SCORE_TO_WIN, isGameSpeed, isScoreToWin } from '@/lib/matches/settings';
import { isOpenForBets, isValidSeriesScore, nextState, seriesScore, type GameResult, type MatchAction, type MatchState } from '@/lib/matches/state';
import { handleMatchEvents, type MatchEvent } from './match-events';
import { inTransaction } from './transaction';

export type { MatchEvent } from './match-events';

export type MatchError =
    /** The match does not exist. */
    | 'not-found'
    /** The match is not in a state that allows this. */
    | 'state'
    /** A player is missing, unknown or the same on both sides. */
    | 'players'
    /** A player is already in a called or started match. */
    | 'player-busy'
    /** A 1v1 match that player 2 has not accepted yet. */
    | 'not-accepted'
    /** Only player 2 of a 1v1 match may accept or decline it, and only player 1 may withdraw it. */
    | 'not-allowed'
    /** The game number is not a game of the match or the next one. */
    | 'game'
    /** The series score or the points are not valid. */
    | 'score'
    /** The match was decided by a no-show, so its games cannot change it. */
    | 'forfeit'
    /** The change would move a player out of a later match that is already called, started or finished. */
    | 'downstream-played'
    /** There is no active event, or the players are not in it. */
    | 'no-event'
    /** The two players already have an open 1v1 match. */
    | 'taken'
    /** The best-of, the rule file, the points to win or the game speed is not valid. */
    | 'settings'
    /** A tournament match cannot be cancelled, since the bracket could not move on. Record a no-show instead. */
    | 'tournament-cancel';

/** A refusal. For downstream-played, blockedBy is the later match that must be reset first. */
export type MatchRefusal = { ok: false; error: MatchError; blockedBy?: number };

export type MatchResult<T = object> = ({ ok: true; events: MatchEvent[] } & T) | MatchRefusal;

export interface MatchPlayer {
    id: number;
    nickname: string;
}

export interface MatchGame {
    number: number;
    status: 'finished' | 'abandoned';
    winnerSlot: 1 | 2 | null;
    points1: number;
    points2: number;
    source: 'server' | 'admin';
    /** The slot of the player who left an abandoned game, as the game server reported it. Null when unknown. */
    leftSlot: 1 | 2 | null;
}

export interface MatchSummary {
    id: number;
    eventId: number;
    /** Null for a 1v1 match. */
    tournamentId: number | null;
    tournamentName: string | null;
    /** The bracket match this match plays. Null for a 1v1 match. */
    bracketMatchId: number | null;
    /** Such as `Winners round 1, match 2`. Null for a 1v1 match. */
    roundLabel: string | null;
    /** Where the match sits in its bracket, so a page can name the round in its own words. Null for a 1v1 match. */
    bracketRound: BracketRound | null;
    state: MatchState;
    bestOf: number;
    ruleFile: string;
    /** Points that win a game. */
    scoreToWin: number;
    /** Game speed in frames per second. */
    speed: number;
    players: [MatchPlayer | null, MatchPlayer | null];
    /** 1v1 only. When player 2 accepted. */
    acceptedAt: Date | null;
    score1: number;
    score2: number;
    winnerId: number | null;
    result: 'played' | 'forfeit' | null;
    cancelReason: 'admin' | 'declined' | 'withdrawn' | null;
}

export interface BracketRound {
    format: FormatId;
    section: Section;
    round: number;
    /** The last round of the section. */
    lastRound: number;
    position: number;
}

export interface MatchDetails extends MatchSummary {
    manualScore: { score1: number; score2: number; afterGame: number } | null;
    /** In the order they were played. */
    games: MatchGame[];
    /** The number the next game gets. The game server reports results with it. */
    nextGame: number;
    /** The last game was abandoned by the game server and waits for the admin to restart or award it. */
    awaitingDecision: boolean;
    calledAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    cancelledAt: Date | null;
}

interface MatchRow {
    id: number;
    event_id: number;
    tournament_id: number | null;
    bracket_match_id: number | null;
    state: MatchState;
    best_of: number;
    rule_file: string;
    score_to_win: number;
    game_speed: number;
    player1_id: number | null;
    player2_id: number | null;
    accepted_at: Date | null;
    score1: number;
    score2: number;
    manual_score1: number | null;
    manual_score2: number | null;
    manual_after_game: number | null;
    game_base: number;
    winner_id: number | null;
    result: 'played' | 'forfeit' | null;
    cancel_reason: 'admin' | 'declined' | 'withdrawn' | null;
    called_at: Date | null;
    started_at: Date | null;
    finished_at: Date | null;
    cancelled_at: Date | null;
}

interface GameRow {
    number: number;
    status: 'finished' | 'abandoned';
    winner_slot: 1 | 2 | null;
    points1: number;
    points2: number;
    source: 'server' | 'admin';
    left_slot: 1 | 2 | null;
}

const MATCH_COLUMNS = `id, event_id, tournament_id, bracket_match_id, state, best_of, rule_file, score_to_win, game_speed, player1_id, player2_id, accepted_at,
    score1, score2, manual_score1, manual_score2, manual_after_game, game_base, winner_id, result, cancel_reason,
    called_at, started_at, finished_at, cancelled_at`;

class Refused extends Error {
    constructor(
        readonly reason: MatchError,
        readonly blockedBy?: number,
    ) {
        super(reason);
    }
}

const refusal = (error: Refused): MatchRefusal => (error.blockedBy === undefined ? { ok: false, error: error.reason } : { ok: false, error: error.reason, blockedBy: error.blockedBy });

/** A transaction on one match. Events are collected and handed to betting before the commit. */
class MatchTx {
    readonly events: MatchEvent[] = [];
    constructor(
        readonly client: PoolClient,
        public match: MatchRow,
    ) {}

    emit(event: MatchEvent) {
        this.events.push(event);
    }

    /** Moves the match to the next state for the action, or refuses. */
    async transition(action: MatchAction, set: Record<string, unknown> = {}) {
        const to = nextState(this.match.state, action);
        if (to === null) throw new Refused('state');
        const stamp = { call: 'called_at', start: 'started_at', finish: 'finished_at', forfeit: 'finished_at', cancel: 'cancelled_at', reopen: null, reset: null }[action];
        const values: Record<string, unknown> = { state: to, ...set };
        const columns = Object.keys(values);
        const assignments = columns.map((column, i) => `${column} = $${i + 2}`);
        if (stamp) assignments.push(`${stamp} = now()`);
        if (action === 'reopen') assignments.push('finished_at = NULL');
        if (action === 'reset') assignments.push('called_at = NULL', 'started_at = NULL', 'finished_at = NULL');
        const { rows } = await this.client.query<MatchRow>(`UPDATE matches SET ${assignments.join(', ')} WHERE id = $1 RETURNING ${MATCH_COLUMNS}`, [
            this.match.id,
            ...columns.map((column) => values[column]),
        ]);
        this.match = rows[0];
    }
}

/**
 * Locks one match in an open transaction. A tournament match also locks its tournament, so changes
 * to matches of the same tournament run one after the other. The tournament is always locked
 * before the match, so two changes cannot wait on each other. Returns null when there is no match.
 */
async function lockMatch(client: PoolClient, matchId: number): Promise<MatchRow | null> {
    const found = await client.query<{ tournament_id: number | null }>('SELECT tournament_id FROM matches WHERE id = $1', [matchId]);
    if (found.rowCount !== 1) return null;
    const tournamentId = found.rows[0].tournament_id;
    if (tournamentId !== null) await client.query('SELECT 1 FROM tournaments WHERE id = $1 FOR NO KEY UPDATE', [tournamentId]);
    const { rows } = await client.query<MatchRow>(`SELECT ${MATCH_COLUMNS} FROM matches WHERE id = $1 FOR UPDATE`, [matchId]);
    return rows[0] ?? null;
}

/** Runs the work on one locked match in its own transaction. */
async function withMatch<T extends object>(pool: Pool, matchId: number, work: (tx: MatchTx) => Promise<T>): Promise<MatchResult<T>> {
    try {
        return await inTransaction(pool, async (client) => {
            const match = await lockMatch(client, matchId);
            if (!match) throw new Refused('not-found');
            const tx = new MatchTx(client, match);
            const value = await work(tx);
            if (tx.events.length > 0) await handleMatchEvents(client, tx.events);
            return { ok: true as const, events: tx.events, ...value };
        });
    } catch (error) {
        if (error instanceof Refused) return refusal(error);
        throw error;
    }
}

export interface BetMatch {
    id: number;
    eventId: number;
    tournamentId: number | null;
    state: MatchState;
    players: [number, number];
}

/**
 * Locks a match for a bet and checks that it is open for bets. Every betting write must call this
 * first, inside its own transaction on the same client, and write the bet before it commits. The
 * lock is the same one every match change takes, in the same order, so a match cannot start, be
 * reset or be cancelled between this check and the bet. Settlement and refunds need no call here,
 * since handleMatchEvents runs while the change already holds the lock.
 */
export async function withMatchForBet(client: PoolClient, matchId: number): Promise<{ ok: true; match: BetMatch } | { ok: false; error: 'not-found' | 'closed' }> {
    const row = await lockMatch(client, matchId);
    if (!row) return { ok: false, error: 'not-found' };
    const players: [number | null, number | null] = [row.player1_id, row.player2_id];
    if (!isOpenForBets({ state: row.state, tournamentId: row.tournament_id, acceptedAt: row.accepted_at, players })) return { ok: false, error: 'closed' };
    return { ok: true, match: { id: row.id, eventId: row.event_id, tournamentId: row.tournament_id, state: row.state, players: [row.player1_id!, row.player2_id!] } };
}

/** The highest game number used so far, counting games a reset cleared. */
const lastGame = (match: MatchRow, games: readonly GameRow[]) => Math.max(games.at(-1)?.number ?? 0, match.game_base);

async function readGames(client: PoolClient | Pool, matchId: number): Promise<GameRow[]> {
    const { rows } = await client.query<GameRow>('SELECT number, status, winner_slot, points1, points2, source, left_slot FROM match_games WHERE match_id = $1 ORDER BY number', [matchId]);
    return rows;
}

const toGameResult = (game: GameRow): GameResult => ({ number: game.number, status: game.status, winnerSlot: game.winner_slot });

function bothPlayers(match: MatchRow): [number, number] {
    if (match.player1_id === null || match.player2_id === null) throw new Refused('players');
    return [match.player1_id, match.player2_id];
}

/** Closes bets when the admin enters a result for a match that the game server has not started. */
async function startIfCalled(tx: MatchTx) {
    if (tx.match.state === 'called') {
        await tx.transition('start');
        tx.emit({ type: 'started', matchId: tx.match.id });
    }
}

/** The games or the manual score may change the result: only a called, started or played match. */
async function requireScorable(tx: MatchTx) {
    if (tx.match.result === 'forfeit') throw new Refused('forfeit');
    if (!['called', 'started', 'finished'].includes(tx.match.state)) throw new Refused('state');
    await startIfCalled(tx);
}

/**
 * Works out the series score from the games again and stores it. A decided series finishes the
 * match, a correction can give it another winner or take the result back, and the bracket follows.
 */
async function settleSeries(tx: MatchTx) {
    const match = tx.match;
    const games = await readGames(tx.client, match.id);
    const manual = match.manual_after_game === null ? null : { score1: match.manual_score1!, score2: match.manual_score2!, afterGame: match.manual_after_game };
    const score = seriesScore(match.best_of, games.map(toGameResult), manual);
    await tx.client.query('UPDATE matches SET score1 = $2, score2 = $3 WHERE id = $1', [match.id, score.score1, score.score2]);
    tx.match = { ...tx.match, score1: score.score1, score2: score.score2 };

    const players = bothPlayers(match);
    const winnerId = score.winnerSlot === null ? null : players[score.winnerSlot - 1];
    const previous = match.state === 'finished' ? match.winner_id : null;
    if (winnerId === previous) return;
    if (previous !== null) {
        await tx.transition('reopen', { winner_id: null, result: null });
        tx.emit({ type: 'reopened', matchId: match.id, previousWinnerId: previous });
    }
    if (winnerId !== null) {
        await tx.transition('finish', { winner_id: winnerId, result: 'played' });
        tx.emit({ type: 'finished', matchId: match.id, winnerId, loserId: winnerId === players[0] ? players[1] : players[0], result: 'played' });
    }
    if (match.tournament_id !== null) await advanceBracket(tx, match.tournament_id);
}

interface BracketRow {
    id: number;
    section: Section;
    round: number;
    position: number;
    player1_id: number | null;
    player2_id: number | null;
    next_winner_match_id: number | null;
    next_winner_slot: 1 | 2 | null;
    next_loser_match_id: number | null;
    next_loser_slot: 1 | 2 | null;
}

const link = (matchId: number | null, slot: 1 | 2 | null): MatchLink | null => (matchId === null ? null : { matchId, slot: slot! });

/**
 * Fills every slot of the bracket from the results, using the links the bracket engine stored,
 * and writes the final places. A slot that no match feeds keeps the player placed at the start.
 * A match that has not been called yet takes the new players. A called, started or finished
 * match whose players would change stops the whole change.
 */
async function advanceBracket(tx: MatchTx, tournamentId: number) {
    const { client } = tx;
    const format = (await client.query<{ format: FormatId }>('SELECT format FROM tournaments WHERE id = $1', [tournamentId])).rows[0].format;
    const bracket = (
        await client.query<BracketRow>(
            `SELECT id, section, round, position, player1_id, player2_id, next_winner_match_id, next_winner_slot, next_loser_match_id, next_loser_slot
             FROM bracket_matches WHERE tournament_id = $1 ORDER BY id`,
            [tournamentId],
        )
    ).rows;
    const runtime = new Map(
        (
            await client.query<Pick<MatchRow, 'id' | 'bracket_match_id' | 'state' | 'winner_id' | 'player1_id' | 'player2_id'>>(
                'SELECT id, bracket_match_id, state, winner_id, player1_id, player2_id FROM matches WHERE tournament_id = $1',
                [tournamentId],
            )
        ).rows.map((row) => [row.bracket_match_id!, row]),
    );

    const fed = new Set<string>();
    for (const b of bracket) {
        if (b.next_winner_match_id !== null) fed.add(`${b.next_winner_match_id}:${b.next_winner_slot}`);
        if (b.next_loser_match_id !== null) fed.add(`${b.next_loser_match_id}:${b.next_loser_slot}`);
    }
    const initial = new Map(bracket.map((b) => [b.id, [fed.has(`${b.id}:1`) ? null : b.player1_id, fed.has(`${b.id}:2`) ? null : b.player2_id] as [number | null, number | null]]));
    const slots = new Map([...initial].map(([id, players]) => [id, [...players] as [number | null, number | null]]));
    const winners = new Map<number, number>();

    // The ids are the play order, and a match only feeds later matches.
    for (const b of bracket) {
        const m = runtime.get(b.id)!;
        const now = slots.get(b.id)!;
        if (now[0] !== m.player1_id || now[1] !== m.player2_id) {
            if (m.state !== 'upcoming' && m.state !== 'cancelled') throw new Refused('downstream-played', m.id);
            await client.query('UPDATE bracket_matches SET player1_id = $2, player2_id = $3 WHERE id = $1', [b.id, now[0], now[1]]);
            await client.query('UPDATE matches SET player1_id = $2, player2_id = $3 WHERE id = $1', [m.id, now[0], now[1]]);
            tx.emit({ type: 'players-changed', matchId: m.id, before: [m.player1_id, m.player2_id], after: [now[0], now[1]] });
        }
        if (m.state !== 'finished' || m.winner_id === null) continue;
        winners.set(b.id, m.winner_id);
        const loser = m.winner_id === now[0] ? now[1] : now[0];
        if (b.next_winner_match_id !== null) slots.get(b.next_winner_match_id)![b.next_winner_slot! - 1] = m.winner_id;
        if (b.next_loser_match_id !== null) slots.get(b.next_loser_match_id)![b.next_loser_slot! - 1] = loser;
    }

    const placings = finalPlacings(
        { format, matches: bracket.map((b) => ({ id: b.id, section: b.section, round: b.round, position: b.position, players: initial.get(b.id)!, winnerTo: link(b.next_winner_match_id, b.next_winner_slot), loserTo: link(b.next_loser_match_id, b.next_loser_slot) })) },
        winners,
    );
    await client.query('DELETE FROM tournament_placings WHERE tournament_id = $1', [tournamentId]);
    if (placings.length > 0) {
        await client.query(
            `INSERT INTO tournament_placings (tournament_id, player_id, place) SELECT $1, player_id, place FROM unnest($2::int[], $3::int[]) AS p (player_id, place)`,
            [tournamentId, placings.map((p) => p.playerId), placings.map((p) => p.place)],
        );
    }
}

/** Adds a match row for each bracket match of a tournament. saveTournament calls it in its transaction. */
export async function createBracketMatches(client: PoolClient, tournamentId: number): Promise<void> {
    await client.query(
        `INSERT INTO matches (event_id, tournament_id, bracket_match_id, best_of, rule_file, score_to_win, game_speed, player1_id, player2_id)
         SELECT t.event_id, bm.tournament_id, bm.id, bm.best_of, bm.rule_file, t.score_to_win, t.game_speed, bm.player1_id, bm.player2_id
         FROM bracket_matches bm JOIN tournaments t ON t.id = bm.tournament_id
         WHERE bm.tournament_id = $1 ORDER BY bm.id`,
        [tournamentId],
    );
}

// Admin tools

/** Tells the players to join. Both players must be known and free, and a 1v1 match must be accepted. */
export async function callMatch(pool: Pool, matchId: number): Promise<MatchResult> {
    return withMatch(pool, matchId, async (tx) => {
        if (tx.match.state !== 'upcoming') throw new Refused('state');
        const players = bothPlayers(tx.match);
        if (tx.match.tournament_id === null && tx.match.accepted_at === null) throw new Refused('not-accepted');
        // Two calls of different matches with a shared player wait here, so only one sees the player free.
        await tx.client.query('SELECT 1 FROM players WHERE id = ANY($1::int[]) ORDER BY id FOR NO KEY UPDATE', [players]);
        const busy = await tx.client.query(
            `SELECT 1 FROM matches WHERE id <> $1 AND state IN ('called', 'started')
             AND (player1_id = ANY($2::int[]) OR player2_id = ANY($2::int[])) LIMIT 1`,
            [tx.match.id, players],
        );
        if (busy.rowCount) throw new Refused('player-busy');
        await tx.transition('call');
        return {};
    });
}

/** Calls several matches, each on its own. Returns the result for each id in the same order. */
export async function callMatches(pool: Pool, matchIds: readonly number[]): Promise<{ matchId: number; result: MatchResult }[]> {
    const results = [];
    for (const matchId of matchIds) results.push({ matchId, result: await callMatch(pool, matchId) });
    return results;
}

/**
 * Restarts the current game from 0-0. When the game server abandoned the last game, that game
 * stays abandoned and is marked as decided by the admin. Otherwise the game being played is
 * stored as abandoned, so a late report for it is ignored. Returns the number the replay gets.
 */
export async function restartCurrentGame(pool: Pool, matchId: number): Promise<MatchResult<{ nextGame: number }>> {
    return withMatch(pool, matchId, async (tx) => {
        if (tx.match.state !== 'started') throw new Refused('state');
        const games = await readGames(tx.client, tx.match.id);
        const last = games.at(-1);
        if (last && last.number > tx.match.game_base && last.status === 'abandoned' && last.source === 'server') {
            await tx.client.query(`UPDATE match_games SET source = 'admin', updated_at = now() WHERE match_id = $1 AND number = $2`, [tx.match.id, last.number]);
            return { nextGame: last.number + 1 };
        }
        const number = lastGame(tx.match, games) + 1;
        await tx.client.query(`INSERT INTO match_games (match_id, number, status, source) VALUES ($1, $2, 'abandoned', 'admin')`, [tx.match.id, number]);
        return { nextGame: number + 1 };
    });
}

export interface GameEntry {
    /** An existing game to correct, or the next game to add. */
    game: number;
    /** The slot that won, or null to store the game as abandoned. */
    winnerSlot: 1 | 2 | null;
    points1: number;
    points2: number;
}

const isPoints = (n: number) => Number.isInteger(n) && n >= 0 && n <= 1000;

/** The winner of a game must have more points than the loser. An abandoned game has no winner. */
const winnerAhead = (winnerSlot: 1 | 2 | null, points1: number, points2: number) => winnerSlot === null || (winnerSlot === 1 ? points1 > points2 : points2 > points1);

/**
 * Enters or corrects a game result by hand. Awarding an abandoned game is a correction that gives
 * it a winner. The series, the winner and the bracket are worked out again. A game the admin set
 * is never changed by a later report from the game server.
 */
export async function enterGameResult(pool: Pool, matchId: number, entry: GameEntry): Promise<MatchResult> {
    if (!Number.isInteger(entry.game) || entry.game < 1) return { ok: false, error: 'game' };
    if (!isPoints(entry.points1) || !isPoints(entry.points2) || ![1, 2, null].includes(entry.winnerSlot)) return { ok: false, error: 'score' };
    if (!winnerAhead(entry.winnerSlot, entry.points1, entry.points2)) return { ok: false, error: 'score' };
    return withMatch(pool, matchId, async (tx) => {
        await requireScorable(tx);
        const games = await readGames(tx.client, tx.match.id);
        if (entry.game <= tx.match.game_base || entry.game > lastGame(tx.match, games) + 1) throw new Refused('game');
        await tx.client.query(
            `INSERT INTO match_games (match_id, number, status, winner_slot, points1, points2, source) VALUES ($1, $2, $3, $4, $5, $6, 'admin')
             ON CONFLICT (match_id, number) DO UPDATE SET status = EXCLUDED.status, winner_slot = EXCLUDED.winner_slot,
                 points1 = EXCLUDED.points1, points2 = EXCLUDED.points2, source = 'admin', left_slot = NULL, updated_at = now()`,
            [tx.match.id, entry.game, entry.winnerSlot === null ? 'abandoned' : 'finished', entry.winnerSlot, entry.points1, entry.points2],
        );
        await settleSeries(tx);
        return {};
    });
}

/**
 * Sets the series score by hand. It replaces every game played so far, and later games count on
 * top of it. A score that reaches the wins needed decides the match.
 */
export async function setSeriesScore(pool: Pool, matchId: number, score1: number, score2: number): Promise<MatchResult> {
    return withMatch(pool, matchId, async (tx) => {
        if (!isValidSeriesScore(tx.match.best_of, score1, score2)) throw new Refused('score');
        await requireScorable(tx);
        const games = await readGames(tx.client, tx.match.id);
        const afterGame = lastGame(tx.match, games);
        await tx.client.query('UPDATE matches SET manual_score1 = $2, manual_score2 = $3, manual_after_game = $4 WHERE id = $1', [tx.match.id, score1, score2, afterGame]);
        tx.match = { ...tx.match, manual_score1: score1, manual_score2: score2, manual_after_game: afterGame };
        await settleSeries(tx);
        return {};
    });
}

/** Records that a player did not show up. The other player wins by forfeit and the bracket advances. */
export async function recordNoShow(pool: Pool, matchId: number, absentSlot: 1 | 2): Promise<MatchResult> {
    return withMatch(pool, matchId, async (tx) => {
        if (absentSlot !== 1 && absentSlot !== 2) throw new Refused('players');
        if (nextState(tx.match.state, 'forfeit') === null) throw new Refused('state');
        const players = bothPlayers(tx.match);
        const winnerId = players[absentSlot === 1 ? 1 : 0];
        const loserId = players[absentSlot - 1];
        await tx.transition('forfeit', { winner_id: winnerId, result: 'forfeit' });
        tx.emit({ type: 'finished', matchId: tx.match.id, winnerId, loserId, result: 'forfeit' });
        if (tx.match.tournament_id !== null) await advanceBracket(tx, tx.match.tournament_id);
        return {};
    });
}

/**
 * Cancels a 1v1 match that is not finished. A tournament match is refused, since the bracket
 * could not move on past it. Record a no-show for it instead.
 */
export async function cancelMatch(pool: Pool, matchId: number): Promise<MatchResult> {
    return withMatch(pool, matchId, async (tx) => {
        if (tx.match.tournament_id !== null) throw new Refused('tournament-cancel');
        await tx.transition('cancel', { cancel_reason: 'admin' });
        tx.emit({ type: 'cancelled', matchId: tx.match.id, reason: 'admin' });
        return {};
    });
}

/**
 * Sends a called, started or finished match back to upcoming. Its games, its manual score and its
 * result are cleared, and bets on it are refunded through the reset event. The game numbers go on
 * from where they were, so a late report for a cleared game is ignored. A started match may have a
 * game in progress that is not stored yet, so its number is skipped too. A finished tournament
 * match takes its players back out of the later matches, which is refused when one of those is
 * called, started or finished too. Reset that one first.
 */
export async function resetMatch(pool: Pool, matchId: number): Promise<MatchResult> {
    return withMatch(pool, matchId, async (tx) => {
        const previousWinnerId = tx.match.winner_id;
        const previousResult = tx.match.result;
        const games = await readGames(tx.client, tx.match.id);
        const gameBase = lastGame(tx.match, games) + (tx.match.state === 'started' ? 1 : 0);
        await tx.client.query('DELETE FROM match_games WHERE match_id = $1', [tx.match.id]);
        await tx.transition('reset', {
            winner_id: null,
            result: null,
            score1: 0,
            score2: 0,
            manual_score1: null,
            manual_score2: null,
            manual_after_game: null,
            game_base: gameBase,
        });
        tx.emit({ type: 'reset', matchId: tx.match.id, previousWinnerId, previousResult });
        if (tx.match.tournament_id !== null && previousWinnerId !== null) await advanceBracket(tx, tx.match.tournament_id);
        return {};
    });
}

// The game server

/** True when the ids are the two players of the match, in either order. */
const samePlayers = (match: MatchRow, ids: readonly number[]) =>
    match.player1_id !== null && match.player2_id !== null && ids.length === 2 && ids.includes(match.player1_id) && ids.includes(match.player2_id);

/**
 * The game server reports both players connected. A called match starts and bets close. When
 * the player ids are given, they must be the two players of the match, or it is refused.
 */
export async function reportPlayersConnected(pool: Pool, matchId: number, playerIds?: readonly number[]): Promise<MatchResult<{ started: boolean }>> {
    return withMatch(pool, matchId, async (tx) => {
        if (playerIds !== undefined && !samePlayers(tx.match, playerIds)) throw new Refused('players');
        if (tx.match.state === 'started') return { started: false };
        if (tx.match.state !== 'called') throw new Refused('state');
        await tx.transition('start');
        tx.emit({ type: 'started', matchId: tx.match.id });
        return { started: true };
    });
}

export interface GameReport {
    /**
     * Unique across all reports of all matches, such as a UUID. The same id sent again changes
     * nothing, even for another match, so a counter that starts again after a restart must not be used.
     */
    reportId: string;
    matchId: number;
    /**
     * The game number from MatchDetails.nextGame. The game server must read nextGame again before
     * each game, since an admin restart or reset moves it on. A report with an old number is ignored.
     */
    game: number;
    /** The slot that won, or null when the game ended without a winner, such as on a disconnect. */
    winnerSlot: 1 | 2 | null;
    points1: number;
    points2: number;
    /** The slot of the player who left a game without a winner. Null or left out when unknown. */
    leftSlot?: 1 | 2 | null;
}

export type ReportStatus =
    /** Stored as the result of the game. */
    | { status: 'applied' }
    /** Kept, but the game was not changed. */
    | { status: 'ignored'; reason: 'state' | 'game-closed' | 'game-ahead' }
    /** A report with this id was stored before. Nothing changed. */
    | { status: 'duplicate' };

const isValidReport = (report: GameReport) =>
    typeof report.reportId === 'string' &&
    report.reportId.length >= 1 &&
    report.reportId.length <= 100 &&
    Number.isInteger(report.game) &&
    report.game >= 1 &&
    isPoints(report.points1) &&
    isPoints(report.points2) &&
    [1, 2, null].includes(report.winnerSlot) &&
    [1, 2, null, undefined].includes(report.leftSlot) &&
    ((report.leftSlot ?? null) === null || report.winnerSlot === null) &&
    winnerAhead(report.winnerSlot, report.points1, report.points2);

/** Stores one report on the locked match and applies it when it is for the next game. */
async function storeReport(tx: MatchTx, report: GameReport, times: { startedAt: Date; endedAt: Date } | null): Promise<ReportStatus> {
    const games = await readGames(tx.client, tx.match.id);
    const last = lastGame(tx.match, games);
    let decision: ReportStatus;
    if (tx.match.state !== 'called' && tx.match.state !== 'started') decision = { status: 'ignored', reason: 'state' };
    else if (report.game <= last) decision = { status: 'ignored', reason: 'game-closed' };
    else if (report.game > last + 1) decision = { status: 'ignored', reason: 'game-ahead' };
    else decision = { status: 'applied' };

    // The match row is locked, so a report with the same id for this match waits here and then finds this one.
    const stored = await tx.client.query(
        `INSERT INTO game_reports (report_id, match_id, game_number, winner_slot, points1, points2, outcome, reason, started_at, ended_at, left_slot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (report_id) DO NOTHING RETURNING report_id`,
        [
            report.reportId,
            tx.match.id,
            report.game,
            report.winnerSlot,
            report.points1,
            report.points2,
            decision.status,
            decision.status === 'ignored' ? decision.reason : null,
            times?.startedAt ?? null,
            times?.endedAt ?? null,
            report.leftSlot ?? null,
        ],
    );
    if (stored.rowCount === 0) return { status: 'duplicate' };
    if (decision.status !== 'applied') return decision;

    await startIfCalled(tx);
    await tx.client.query(`INSERT INTO match_games (match_id, number, status, winner_slot, points1, points2, source, left_slot) VALUES ($1, $2, $3, $4, $5, $6, 'server', $7)`, [
        tx.match.id,
        report.game,
        report.winnerSlot === null ? 'abandoned' : 'finished',
        report.winnerSlot,
        report.points1,
        report.points2,
        report.leftSlot ?? null,
    ]);
    await settleSeries(tx);
    return decision;
}

/**
 * Stores a game result from the game server. Each report id is stored once. A report for a game
 * that already has a result, from an admin or an earlier report, is kept but changes nothing. A
 * report for a called match starts it first.
 */
export async function reportGameResult(pool: Pool, report: GameReport): Promise<MatchResult<ReportStatus> | { ok: false; error: 'invalid' }> {
    if (!isValidReport(report)) return { ok: false, error: 'invalid' };
    return withMatch<ReportStatus>(pool, report.matchId, (tx) => storeReport(tx, report, null));
}

export interface ServerGameReport {
    /** A UUID. See GameReport.reportId. */
    reportId: string;
    matchId: number;
    game: number;
    /** The player who won, or null for an abandoned game. */
    winnerId: number | null;
    /** The player who left an abandoned game, when the server knows. It must be one of the two players of the match. */
    leftPlayerId?: number | null;
    /** The points of each of the two players of the match, in any order. */
    points: readonly { playerId: number; points: number }[];
    startedAt: Date;
    endedAt: Date;
}

/**
 * Stores a game result from the game server API, which names players by id instead of slot. A
 * report id that was stored before answers duplicate, even when the match changed since. The
 * players must be the two players of the match, or it is refused.
 */
export async function reportServerGame(pool: Pool, report: ServerGameReport): Promise<MatchResult<ReportStatus>> {
    return withMatch<ReportStatus>(pool, report.matchId, async (tx) => {
        const known = await tx.client.query('SELECT 1 FROM game_reports WHERE report_id = $1', [report.reportId]);
        if (known.rowCount) return { status: 'duplicate' };
        const ids = report.points.map((p) => p.playerId);
        if (!samePlayers(tx.match, ids)) throw new Refused('players');
        const [player1, player2] = bothPlayers(tx.match);
        if (report.winnerId !== null && !ids.includes(report.winnerId)) throw new Refused('players');
        const left = report.leftPlayerId ?? null;
        if (left !== null && (report.winnerId !== null || !ids.includes(left))) throw new Refused('players');
        const pointsOf = (playerId: number) => report.points.find((p) => p.playerId === playerId)!.points;
        const slots: GameReport = {
            reportId: report.reportId,
            matchId: tx.match.id,
            game: report.game,
            winnerSlot: report.winnerId === null ? null : report.winnerId === player1 ? 1 : 2,
            points1: pointsOf(player1),
            points2: pointsOf(player2),
            leftSlot: left === null ? null : left === player1 ? 1 : 2,
        };
        if (!isValidReport(slots)) throw new Refused('score');
        return storeReport(tx, slots, { startedAt: report.startedAt, endedAt: report.endedAt });
    });
}

// 1v1 matches

export interface ChallengeOptions {
    bestOf?: number;
    ruleFile?: string;
    /** Points that win a game. 15 when not given. */
    scoreToWin?: number;
    /** Game speed in frames per second. 75 when not given. */
    speed?: number;
}

/**
 * A signed in player asks another player of the same active event for a 1v1 match. It can only be
 * called after the other player accepts. Two players can have one open 1v1 match at a time.
 */
export async function createChallenge(pool: Pool, challengerId: number, opponentId: number, options: ChallengeOptions = {}): Promise<{ ok: true; matchId: number } | { ok: false; error: MatchError }> {
    const bestOf = options.bestOf ?? 1;
    const ruleFile = options.ruleFile ?? DEFAULT_RULES;
    const scoreToWin = options.scoreToWin ?? DEFAULT_SCORE_TO_WIN;
    const speed = options.speed ?? DEFAULT_GAME_SPEED;
    if (!isBestOf(bestOf) || !isRuleFile(ruleFile) || !isScoreToWin(scoreToWin) || !isGameSpeed(speed)) return { ok: false, error: 'settings' };
    if (challengerId === opponentId) return { ok: false, error: 'players' };
    try {
        const matchId = await inTransaction(pool, async (client) => {
            // Locks the event row, so it cannot be closed while the match is added.
            const { rows } = await client.query<{ id: number; event_id: number }>(
                `SELECT p.id, p.event_id FROM players p JOIN events e ON e.id = p.event_id AND e.is_active
                 WHERE p.id = ANY($1::int[]) FOR SHARE OF e`,
                [[challengerId, opponentId]],
            );
            if (rows.length !== 2 || rows[0].event_id !== rows[1].event_id) throw new Refused('no-event');
            const inserted = await client.query<{ id: number }>(
                `INSERT INTO matches (event_id, best_of, rule_file, score_to_win, game_speed, player1_id, player2_id) VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT DO NOTHING RETURNING id`,
                [rows[0].event_id, bestOf, ruleFile, scoreToWin, speed, challengerId, opponentId],
            );
            if (inserted.rowCount === 0) throw new Refused('taken');
            return inserted.rows[0].id;
        });
        return { ok: true, matchId };
    } catch (error) {
        if (error instanceof Refused) return refusal(error);
        throw error;
    }
}

async function requireOpenChallenge(tx: MatchTx, playerId: number) {
    if (tx.match.tournament_id !== null || tx.match.player2_id !== playerId) throw new Refused('not-allowed');
    if (tx.match.state !== 'upcoming' || tx.match.accepted_at !== null) throw new Refused('state');
    const active = await tx.client.query('SELECT 1 FROM events WHERE id = $1 AND is_active', [tx.match.event_id]);
    if (active.rowCount !== 1) throw new Refused('no-event');
}

/** Player 2 accepts a 1v1 match. It stays upcoming until an admin calls it. */
export async function acceptChallenge(pool: Pool, matchId: number, playerId: number): Promise<MatchResult> {
    return withMatch(pool, matchId, async (tx) => {
        await requireOpenChallenge(tx, playerId);
        await tx.client.query('UPDATE matches SET accepted_at = now() WHERE id = $1', [tx.match.id]);
        return {};
    });
}

/** Player 2 declines a 1v1 match. It is cancelled. */
export async function declineChallenge(pool: Pool, matchId: number, playerId: number): Promise<MatchResult> {
    return withMatch(pool, matchId, async (tx) => {
        await requireOpenChallenge(tx, playerId);
        await tx.transition('cancel', { cancel_reason: 'declined' });
        tx.emit({ type: 'cancelled', matchId: tx.match.id, reason: 'declined' });
        return {};
    });
}

/**
 * Player 1 takes back a 1v1 match that player 2 has not answered yet. It is cancelled. Bets open
 * only once a 1v1 match is accepted, so none can exist here, but the cancel still goes to betting
 * like any other.
 */
export async function withdrawChallenge(pool: Pool, matchId: number, playerId: number): Promise<MatchResult> {
    return withMatch(pool, matchId, async (tx) => {
        if (tx.match.tournament_id !== null || tx.match.player1_id !== playerId) throw new Refused('not-allowed');
        if (tx.match.state !== 'upcoming' || tx.match.accepted_at !== null) throw new Refused('state');
        await tx.transition('cancel', { cancel_reason: 'withdrawn' });
        tx.emit({ type: 'cancelled', matchId: tx.match.id, reason: 'withdrawn' });
        return {};
    });
}

// Reading

interface SummaryRecord extends MatchRow {
    tournament_name: string | null;
    format: FormatId | null;
    section: Section | null;
    round: number | null;
    position: number | null;
    last_round: number | null;
    nickname1: string | null;
    nickname2: string | null;
}

const SUMMARY_SELECT = `SELECT ${MATCH_COLUMNS
    .split(',')
    .map((c) => `m.${c.trim()}`)
    .join(', ')},
    t.name AS tournament_name, t.format, bm.section, bm.round, bm.position,
    (SELECT max(o.round) FROM bracket_matches o WHERE o.tournament_id = bm.tournament_id AND o.section = bm.section) AS last_round,
    p1.nickname AS nickname1, p2.nickname AS nickname2
    FROM matches m
    LEFT JOIN tournaments t ON t.id = m.tournament_id
    LEFT JOIN bracket_matches bm ON bm.id = m.bracket_match_id
    LEFT JOIN players p1 ON p1.id = m.player1_id
    LEFT JOIN players p2 ON p2.id = m.player2_id`;

function toSummary(row: SummaryRecord): MatchSummary {
    const player = (id: number | null, nickname: string | null): MatchPlayer | null => (id === null ? null : { id, nickname: nickname ?? `Player ${id}` });
    return {
        id: row.id,
        eventId: row.event_id,
        tournamentId: row.tournament_id,
        tournamentName: row.tournament_name,
        bracketMatchId: row.bracket_match_id,
        roundLabel: row.format && row.section ? `${roundName(row.format, row.section, row.round!, row.last_round!)}, match ${row.position}` : null,
        bracketRound: row.format && row.section ? { format: row.format, section: row.section, round: row.round!, lastRound: row.last_round!, position: row.position! } : null,
        state: row.state,
        bestOf: row.best_of,
        ruleFile: row.rule_file,
        scoreToWin: row.score_to_win,
        speed: row.game_speed,
        players: [player(row.player1_id, row.nickname1), player(row.player2_id, row.nickname2)],
        acceptedAt: row.accepted_at,
        score1: row.score1,
        score2: row.score2,
        winnerId: row.winner_id,
        result: row.result,
        cancelReason: row.cancel_reason,
    };
}

/** The matches of an event in play order: tournament matches by bracket order, then 1v1 matches. */
export async function listMatches(pool: Pool, eventId: number): Promise<MatchSummary[]> {
    const { rows } = await pool.query<SummaryRecord>(`${SUMMARY_SELECT} WHERE m.event_id = $1 ORDER BY m.id`, [eventId]);
    return rows.map(toSummary);
}

/** A match with its games. The game server and betting read matches here. */
export async function getMatch(pool: Pool, matchId: number): Promise<MatchDetails | null> {
    const { rows } = await pool.query<SummaryRecord>(`${SUMMARY_SELECT} WHERE m.id = $1`, [matchId]);
    const row = rows[0];
    if (!row) return null;
    const games = await readGames(pool, matchId);
    const last = games.at(-1);
    return {
        ...toSummary(row),
        manualScore: row.manual_after_game === null ? null : { score1: row.manual_score1!, score2: row.manual_score2!, afterGame: row.manual_after_game },
        games: games.map((g) => ({ number: g.number, status: g.status, winnerSlot: g.winner_slot, points1: g.points1, points2: g.points2, source: g.source, leftSlot: g.left_slot })),
        nextGame: lastGame(row, games) + 1,
        awaitingDecision: row.state === 'started' && last !== undefined && last.number > row.game_base && last.status === 'abandoned' && last.source === 'server',
        calledAt: row.called_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        cancelledAt: row.cancelled_at,
    };
}

export interface AwaitingMatch extends MatchSummary {
    eventName: string;
    /** The abandoned game that waits for the admin to restart or award it. */
    game: MatchGame;
}

/**
 * The matches of every event whose last game the game server abandoned, so they wait for an admin
 * to restart or award the game. The same rule as awaitingDecision in getMatch. The longest waiting first.
 */
export async function listAwaitingDecision(pool: Pool): Promise<AwaitingMatch[]> {
    const { rows: waiting } = await pool.query<GameRow & { match_id: number; event_name: string }>(
        `SELECT m.id AS match_id, e.name AS event_name, lg.number, lg.status, lg.winner_slot, lg.points1, lg.points2, lg.source, lg.left_slot
         FROM matches m
         JOIN events e ON e.id = m.event_id
         JOIN LATERAL (SELECT * FROM match_games g WHERE g.match_id = m.id ORDER BY g.number DESC LIMIT 1) lg ON true
         WHERE m.state = 'started' AND lg.number > m.game_base AND lg.status = 'abandoned' AND lg.source = 'server'
         ORDER BY lg.updated_at, m.id`,
    );
    if (waiting.length === 0) return [];
    const { rows } = await pool.query<SummaryRecord>(`${SUMMARY_SELECT} WHERE m.id = ANY($1::int[])`, [waiting.map((w) => w.match_id)]);
    const summaries = new Map(rows.map((row) => [row.id, toSummary(row)]));
    return waiting.flatMap((w) => {
        const summary = summaries.get(w.match_id);
        if (!summary) return [];
        const game: MatchGame = { number: w.number, status: w.status, winnerSlot: w.winner_slot, points1: w.points1, points2: w.points2, source: w.source, leftSlot: w.left_slot };
        return [{ ...summary, eventName: w.event_name, game }];
    });
}

/** The final places of a tournament decided so far, best first. */
export async function getPlacings(pool: Pool, tournamentId: number): Promise<Placing[]> {
    const { rows } = await pool.query<{ place: number; player_id: number }>('SELECT place, player_id FROM tournament_placings WHERE tournament_id = $1 ORDER BY place, player_id', [tournamentId]);
    return rows.map((row) => ({ place: row.place, playerId: row.player_id }));
}
