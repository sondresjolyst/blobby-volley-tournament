// The data of the big screen. It only reads, through the other stores.
import type { Pool } from 'pg';
import { buildBigScreen, EMPTY_SCREEN, pickTournament, type BigScreenData } from '@/lib/big-screen/view';
import { listMatchPools } from './bets';
import { getActiveEvent } from './events';
import { getLiveScore, type LiveScore } from './game-server';
import { listMatches } from './matches';
import { listShownSponsors } from './sponsors';
import { getLeaderboard } from './stats';
import { getTournament, listTournaments } from './tournaments';

/**
 * Everything the big screen shows for the active event. `wanted` picks the tournament of the
 * bracket. Without it, or when it is not a tournament of the event, the screen picks one. The
 * event code is left out unless `withCode` is set, which only a request with the big screen key may do.
 */
export async function getBigScreen(pool: Pool, wanted: number | null = null, withCode = false): Promise<BigScreenData> {
    const event = await getActiveEvent(pool);
    if (!event) return EMPTY_SCREEN;
    const [matches, pools, leaderboard, tournaments, sponsors] = await Promise.all([
        listMatches(pool, event.id),
        listMatchPools(pool, event.id),
        getLeaderboard(pool, event.id),
        listTournaments(pool, event.id),
        listShownSponsors(pool),
    ]);
    // Only a few matches are on the floor at once, so one read each is fine.
    const floor = matches.filter((m) => m.state === 'called' || m.state === 'started');
    const live = (await Promise.all(floor.map((m) => getLiveScore(pool, m.id)))).filter((l): l is LiveScore => l !== null);
    const tournamentId = pickTournament(
        tournaments.map((t) => t.id),
        matches,
        live,
        wanted,
    );
    const saved = tournamentId === null ? null : await getTournament(pool, tournamentId);
    const data = buildBigScreen({
        event: { id: event.id, name: event.name },
        matches,
        pools,
        live,
        leaderboard: leaderboard!,
        tournament: saved ? { id: saved.id, name: saved.name, format: saved.format, matches: saved.matches } : null,
        sponsors,
    });
    return withCode ? { ...data, eventCode: event.code } : data;
}
