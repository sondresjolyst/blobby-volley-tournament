// Leaderboards and stats. Nothing here is stored. Every number is worked out from the stored
// results, games, bets and placings when it is read, so a corrected result, a reset or a reversed
// settlement shows up at once, also in past events.
import type { Pool } from 'pg';
import type { PlayedSeries } from '@/lib/big-screen/facts';
import { compareCorrect, bettorStats, type BettorStats, type SettledBet } from '@/lib/stats/betting';
import { ELO_START, eloChanges, replayElo, type RatedMatch } from '@/lib/stats/elo';
import { compareWins, playerStats, type PlayedMatch, type PlayerStats } from '@/lib/stats/players';

/**
 * The matches that change ratings: finished and played out. They come in play order across all
 * events: events by start date, then matches by when they started. A correction keeps the start
 * time, so a corrected match stays in its place. A player is known across events by the nickname
 * in lower case, since each event has its own player rows.
 */
async function ratedMatches(pool: Pool): Promise<RatedMatch[]> {
    const { rows } = await pool.query<{ id: number; event_id: number; tournament_id: number | null; winner: string; loser: string }>(
        `SELECT m.id, m.event_id, m.tournament_id, w.nickname_key AS winner, l.nickname_key AS loser
         FROM matches m
         JOIN events e ON e.id = m.event_id
         JOIN players w ON w.id = m.winner_id
         JOIN players l ON l.id = CASE WHEN m.winner_id = m.player1_id THEN m.player2_id ELSE m.player1_id END
         WHERE m.state = 'finished' AND m.result = 'played'
         ORDER BY e.starts_on, e.id, coalesce(m.started_at, m.finished_at), m.id`,
    );
    return rows.map((r) => ({ matchId: r.id, eventId: r.event_id, tournamentId: r.tournament_id, winner: r.winner, loser: r.loser }));
}

export interface EloEntry {
    playerId: number;
    /** The rating at the end of the event, or now for the active event. */
    rating: number;
    /** The rating the player brought into the event from earlier events. */
    start: number;
    /** The change during the event, or during the tournament when one is asked for. */
    change: number;
    /** Rated matches in the event, or in the tournament. */
    matches: number;
}

/** The Elo rating of every player of an event. With a tournament, the change is the one in that tournament. */
export async function eloForEvent(pool: Pool, eventId: number, tournamentId: number | null = null): Promise<Map<number, EloEntry>> {
    const [matches, order, players] = await Promise.all([
        ratedMatches(pool),
        pool.query<{ id: number }>('SELECT id FROM events ORDER BY starts_on, id'),
        pool.query<{ id: number; nickname_key: string }>('SELECT id, nickname_key FROM players WHERE event_id = $1', [eventId]),
    ]);
    const rank = new Map(order.rows.map((row, i) => [row.id, i]));
    const own = rank.get(eventId) ?? -1;
    const before = replayElo(matches.filter((m) => rank.get(m.eventId)! < own));
    const through = replayElo(matches.filter((m) => rank.get(m.eventId)! <= own));
    const inScope = (m: RatedMatch) => m.eventId === eventId && (tournamentId === null || m.tournamentId === tournamentId);
    const changes = eloChanges(through, inScope);
    const played = new Map<string, number>();
    for (const m of matches.filter(inScope)) for (const key of [m.winner, m.loser]) played.set(key, (played.get(key) ?? 0) + 1);
    return new Map(
        players.rows.map((p) => {
            const key = p.nickname_key;
            const entry: EloEntry = {
                playerId: p.id,
                rating: through.ratings.get(key) ?? ELO_START,
                start: before.ratings.get(key) ?? ELO_START,
                change: changes.get(key) ?? 0,
                matches: played.get(key) ?? 0,
            };
            return [p.id, entry];
        }),
    );
}

/** The current rating of each player of an event, for seeding by Elo. */
export async function eloRatings(pool: Pool, eventId: number): Promise<Map<number, number>> {
    return new Map([...(await eloForEvent(pool, eventId))].map(([id, entry]) => [id, entry.rating]));
}

/**
 * The played matches of an event or a tournament in play order. The points are those of the
 * finished games that count for the series. Games a series score set by hand replaced do not.
 */
async function playedMatches(pool: Pool, eventId: number, tournamentId: number | null): Promise<PlayedMatch[]> {
    const { rows } = await pool.query<{ id: number; tournament_id: number | null; player1_id: number; player2_id: number; winner_id: number; score1: number; score2: number; points1: number; points2: number }>(
        `SELECT m.id, m.tournament_id, m.player1_id, m.player2_id, m.winner_id, m.score1, m.score2,
             coalesce(sum(g.points1), 0)::int AS points1, coalesce(sum(g.points2), 0)::int AS points2
         FROM matches m
         LEFT JOIN match_games g ON g.match_id = m.id AND g.status = 'finished' AND g.number > coalesce(m.manual_after_game, 0)
         WHERE m.event_id = $1 AND ($2::int IS NULL OR m.tournament_id = $2) AND m.state = 'finished' AND m.result = 'played'
         GROUP BY m.id
         ORDER BY coalesce(m.started_at, m.finished_at), m.id`,
        [eventId, tournamentId],
    );
    return rows.map((r) => ({
        matchId: r.id,
        tournamentId: r.tournament_id,
        players: [r.player1_id, r.player2_id],
        winnerId: r.winner_id,
        score: [r.score1, r.score2],
        points: [r.points1, r.points2],
    }));
}

/**
 * The series of an event that are being played or were played out, for the records of the big
 * screen. No-shows and cancelled matches are left out. The games are the finished ones that count
 * for the series, in the order they were played.
 */
export async function listPlayedSeries(pool: Pool, eventId: number): Promise<PlayedSeries[]> {
    const { rows } = await pool.query<{ id: number; player1_id: number; player2_id: number; best_of: number; winner_id: number | null; manual: boolean; seconds: number | null; games: { w: 1 | 2; p1: number; p2: number }[] }>(
        `SELECT m.id, m.player1_id, m.player2_id, m.best_of, m.winner_id, m.manual_after_game IS NOT NULL AS manual,
             CASE WHEN m.state = 'finished' THEN extract(epoch FROM m.finished_at - m.started_at)::int END AS seconds,
             coalesce(json_agg(json_build_object('w', g.winner_slot, 'p1', g.points1, 'p2', g.points2) ORDER BY g.number) FILTER (WHERE g.number IS NOT NULL), '[]') AS games
         FROM matches m
         LEFT JOIN match_games g ON g.match_id = m.id AND g.status = 'finished' AND g.number > coalesce(m.manual_after_game, 0)
         WHERE m.event_id = $1 AND m.state IN ('started', 'finished') AND m.result IS DISTINCT FROM 'forfeit'
         GROUP BY m.id
         ORDER BY coalesce(m.started_at, m.finished_at), m.id`,
        [eventId],
    );
    return rows.map((r) => ({
        matchId: r.id,
        players: [r.player1_id, r.player2_id],
        bestOf: r.best_of,
        winnerId: r.winner_id,
        games: r.games.map((g) => ({ winnerSlot: g.w, points: [g.p1, g.p2] as [number, number] })),
        manual: r.manual,
        seconds: r.seconds,
    }));
}

/** The settled bets on the matches of an event or a tournament, in the order they were placed. */
async function settledBets(pool: Pool, eventId: number, tournamentId: number | null): Promise<SettledBet[]> {
    const { rows } = await pool.query<{ id: number; match_id: number; player_id: number; on_player_id: number; amount: number; status: SettledBet['status']; payout: number }>(
        `SELECT b.id, b.match_id, b.player_id, b.on_player_id, b.amount, b.status, b.payout
         FROM bets b JOIN matches m ON m.id = b.match_id
         WHERE m.event_id = $1 AND ($2::int IS NULL OR m.tournament_id = $2) AND b.status IN ('won', 'lost', 'returned')
         ORDER BY b.id`,
        [eventId, tournamentId],
    );
    return rows.map((r) => ({ betId: r.id, matchId: r.match_id, bettorId: r.player_id, onPlayerId: r.on_player_id, amount: r.amount, status: r.status, payout: r.payout }));
}

export interface Placed {
    tournamentId: number;
    tournamentName: string;
    playerId: number;
    place: number;
}

async function placings(pool: Pool, eventId: number, tournamentId: number | null): Promise<Placed[]> {
    const { rows } = await pool.query<{ tournament_id: number; name: string; player_id: number; place: number }>(
        `SELECT t.id AS tournament_id, t.name, tp.player_id, tp.place
         FROM tournament_placings tp JOIN tournaments t ON t.id = tp.tournament_id
         WHERE t.event_id = $1 AND ($2::int IS NULL OR t.id = $2)
         ORDER BY t.id, tp.place, tp.player_id`,
        [eventId, tournamentId],
    );
    return rows.map((r) => ({ tournamentId: r.tournament_id, tournamentName: r.name, playerId: r.player_id, place: r.place }));
}

export interface Leaderboard {
    eventId: number;
    tournamentId: number | null;
    /** The nickname of every player of the event. */
    nicknames: Map<number, string>;
    /** Players with a played match, the most wins first. */
    wins: PlayerStats[];
    /** Bettors with a settled bet, the most correct bets first. */
    bettors: BettorStats[];
    /** Every player of the event, or of the tournament, the highest rating first. */
    elo: EloEntry[];
    /** The final places decided so far, by tournament. */
    placings: Placed[];
}

/** The leaderboards of an event, or of one of its tournaments. Null when the tournament is not in the event. */
export async function getLeaderboard(pool: Pool, eventId: number, tournamentId: number | null = null): Promise<Leaderboard | null> {
    if (tournamentId !== null) {
        const found = await pool.query('SELECT 1 FROM tournaments WHERE id = $1 AND event_id = $2', [tournamentId, eventId]);
        if (found.rowCount !== 1) return null;
    }
    const [players, matches, bets, elo, placed, entrants] = await Promise.all([
        pool.query<{ id: number; nickname: string }>('SELECT id, nickname FROM players WHERE event_id = $1', [eventId]),
        playedMatches(pool, eventId, tournamentId),
        settledBets(pool, eventId, tournamentId),
        eloForEvent(pool, eventId, tournamentId),
        placings(pool, eventId, tournamentId),
        tournamentId === null ? null : pool.query<{ player_id: number }>('SELECT player_id FROM tournament_players WHERE tournament_id = $1', [tournamentId]),
    ]);
    const nicknames = new Map(players.rows.map((p) => [p.id, p.nickname]));
    const byName = (a: number, b: number) => (nicknames.get(a) ?? '').localeCompare(nicknames.get(b) ?? '', 'nb') || a - b;
    const shown = entrants === null ? null : new Set(entrants.rows.map((r) => r.player_id));
    return {
        eventId,
        tournamentId,
        nicknames,
        wins: [...playerStats(matches).values()].sort((a, b) => compareWins(a, b) || byName(a.playerId, b.playerId)),
        bettors: [...bettorStats(bets).values()].sort((a, b) => compareCorrect(a, b) || byName(a.playerId, b.playerId)),
        elo: [...elo.values()].filter((e) => shown === null || shown.has(e.playerId)).sort((a, b) => b.rating - a.rating || byName(a.playerId, b.playerId)),
        placings: placed,
    };
}

export interface PlayerStatsPage {
    player: { id: number; nickname: string; eventId: number; eventName: string };
    /** Null before the first played match. */
    stats: PlayerStats | null;
    /** Null before the first settled bet. */
    betting: BettorStats | null;
    elo: EloEntry;
    placings: Placed[];
    nicknames: Map<number, string>;
}

/** Every stat of one player in the event of that player. Null when there is no such player. */
export async function getPlayerStats(pool: Pool, playerId: number): Promise<PlayerStatsPage | null> {
    const { rows } = await pool.query<{ id: number; nickname: string; event_id: number; event_name: string }>(
        'SELECT p.id, p.nickname, p.event_id, e.name AS event_name FROM players p JOIN events e ON e.id = p.event_id WHERE p.id = $1',
        [playerId],
    );
    const row = rows[0];
    if (!row) return null;
    const board = (await getLeaderboard(pool, row.event_id))!;
    return {
        player: { id: row.id, nickname: row.nickname, eventId: row.event_id, eventName: row.event_name },
        stats: board.wins.find((s) => s.playerId === playerId) ?? null,
        betting: board.bettors.find((s) => s.playerId === playerId) ?? null,
        elo: board.elo.find((e) => e.playerId === playerId)!,
        placings: board.placings.filter((p) => p.playerId === playerId),
        nicknames: board.nicknames,
    };
}
