// Lists the games of an event for the Resultat page: matches and training together.
// Only games that have started count. Upcoming, called and cancelled games are left out.
import type { Pool } from 'pg';
import { PAGE_SIZE, type Page } from '@/lib/paging';
import { trainingBotName } from '@/lib/training/settings';
import { BOT_PLAYER_ID } from './training';

export interface GameListFilter {
    /** Only the games of this player. An id that is not a player of the event is ignored. */
    playerId?: number;
    /** With a player, only the games between the two. Training never matches two players. Ignored without a player. */
    opponentId?: number;
    /** Only the newest games, up to this many. Without it all the games are read. */
    limit?: number;
}

export interface GameListRow {
    /** The id of the match page. Matches and training share one sequence of ids. */
    id: number;
    /** A tournament match, a 1v1 match or a training game. */
    kind: 'tournament' | '1v1' | 'training';
    /** The names in the order of the players. The second is the bot of a training game. */
    names: [string | null, string | null];
    /** The player ids in the order of the names. The bot has id 0. */
    playerIds: [number | null, number | null];
    /** The series score of a match, or the points of a training game. Null while a training game runs and for a walkover. */
    score: [number, number] | null;
    running: boolean;
    /** A match decided by a no-show. It has no score. */
    walkover: boolean;
    ruleFile: string;
}

interface Row {
    id: number;
    kind: GameListRow['kind'];
    name1: string | null;
    name2: string | null;
    id1: number | null;
    id2: number | null;
    score1: number | null;
    score2: number | null;
    running: boolean;
    walkover: boolean;
    rule_file: string;
    bot: string | null;
    difficulty: number | null;
}

/** The ids of a filter that count: the player and the opponent, or null when they are unknown or the same. */
async function knownFilter(pool: Pool, eventId: number, filter: GameListFilter): Promise<[number | null, number | null]> {
    const known = new Set<number>((await pool.query<{ id: number }>('SELECT id FROM players WHERE event_id = $1', [eventId])).rows.map((r) => r.id));
    const player = filter.playerId !== undefined && known.has(filter.playerId) ? filter.playerId : null;
    const opponent = player !== null && filter.opponentId !== undefined && filter.opponentId !== player && known.has(filter.opponentId) ? filter.opponentId : null;
    return [player, opponent];
}

/** The games of the event as a CTE named g. Takes the event as $1, the player as $2 and the opponent as $3. */
const GAMES_CTE = `WITH g AS (
             SELECT m.id, CASE WHEN m.tournament_id IS NULL THEN '1v1' ELSE 'tournament' END AS kind,
                    p1.nickname AS name1, p2.nickname AS name2, m.player1_id AS id1, m.player2_id AS id2,
                    m.score1, m.score2, m.state = 'started' AS running, COALESCE(m.result = 'forfeit', false) AS walkover, m.rule_file, NULL::text AS bot, NULL::integer AS difficulty,
                    COALESCE(m.finished_at, m.started_at, m.created_at) AS at
             FROM matches m
             LEFT JOIN players p1 ON p1.id = m.player1_id
             LEFT JOIN players p2 ON p2.id = m.player2_id
             WHERE m.event_id = $1 AND m.state IN ('started', 'finished')
               AND ($2::integer IS NULL OR ((m.player1_id = $2 OR m.player2_id = $2) AND ($3::integer IS NULL OR m.player1_id = $3 OR m.player2_id = $3)))
             UNION ALL
             SELECT t.id, 'training', p.nickname, NULL, t.player_id, ${BOT_PLAYER_ID},
                    t.player_points, t.bot_points, t.state = 'started', false, t.rule_file, t.bot, t.difficulty,
                    COALESCE(t.finished_at, t.started_at, t.created_at)
             FROM training_matches t JOIN players p ON p.id = t.player_id
             WHERE t.event_id = $1 AND t.state IN ('started', 'finished')
               AND $3::integer IS NULL AND ($2::integer IS NULL OR t.player_id = $2)
         )`;

const toRow = (r: Row): GameListRow => ({
    id: r.id,
    kind: r.kind,
    names: [r.name1, r.kind === 'training' ? trainingBotName(r.bot!, r.difficulty!) : r.name2],
    playerIds: [r.id1, r.id2],
    score: r.walkover || r.score1 === null || r.score2 === null || (r.running && r.kind === 'training') ? null : [r.score1, r.score2],
    running: r.running,
    walkover: r.walkover,
    ruleFile: r.rule_file,
});

/** The games of the event, running ones first and then the newest. With a limit, only the first ones. */
export async function listEventGames(pool: Pool, eventId: number, filter: GameListFilter = {}): Promise<GameListRow[]> {
    const [player, opponent] = await knownFilter(pool, eventId, filter);
    const limit = filter.limit === undefined ? null : Math.max(0, Math.floor(filter.limit));
    const { rows } = await pool.query<Row>(`${GAMES_CTE} SELECT * FROM g ORDER BY running DESC, at DESC, id DESC, kind LIMIT $4::integer`, [eventId, player, opponent, limit]);
    return rows.map(toRow);
}

/** One page of the games, in the same order as listEventGames. A page past the last gives the last page. */
export async function listEventGamesPage(pool: Pool, eventId: number, filter: GameListFilter, requested: number, size = PAGE_SIZE): Promise<Page<GameListRow>> {
    const [player, opponent] = await knownFilter(pool, eventId, filter);
    const counted = await pool.query<{ total: string }>(`${GAMES_CTE} SELECT count(*) AS total FROM g`, [eventId, player, opponent]);
    const total = Number(counted.rows[0].total);
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(Math.max(1, requested), pages);
    const start = (page - 1) * size;
    const { rows } = await pool.query<Row>(`${GAMES_CTE} SELECT * FROM g ORDER BY running DESC, at DESC, id DESC, kind LIMIT $4::integer OFFSET $5::integer`, [eventId, player, opponent, size, start]);
    return { items: rows.map(toRow), page, pages, total, first: rows.length === 0 ? 0 : start + 1, last: start + rows.length };
}
