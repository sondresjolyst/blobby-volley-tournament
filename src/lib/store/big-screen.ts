// The data of the big screen. It only reads, through the other stores.
import type { Pool } from 'pg';
import { bigScreenKeyMatches } from '@/lib/big-screen/key';
import { buildBigScreen, EMPTY_SCREEN, pickTournament, type BigScreenData } from '@/lib/big-screen/view';
import { TtlCache } from '@/lib/ttl-cache';
import { listMatchPools } from './bets';
import { getActiveEvent, getBigScreenKey, type EventRow } from './events';
import { getLiveScore, type LiveScore } from './game-server';
import { listMatches } from './matches';
import { listShownSponsors } from './sponsors';
import { getLeaderboard, listPlayedSeries } from './stats';
import { getTournament, listTournaments } from './tournaments';

/** How long the screen data of an event is shared between the TVs that read it. */
export const SCREEN_CACHE_MS = 3_000;

/**
 * The screen data the page and the JSON route share, per event and wanted tournament. Every TV
 * polls every few seconds, and each build replays the Elo of every event, so the TVs share one
 * build for a few seconds. The event code and the key are never in it.
 */
export const screenCache = new TtlCache<BigScreenData>(SCREEN_CACHE_MS);

/** Builds the screen data of the event without the event code. This is the costly part. */
async function buildScreen(pool: Pool, event: EventRow, wanted: number | null): Promise<BigScreenData> {
    const [matches, pools, leaderboard, tournaments, sponsors, series] = await Promise.all([
        listMatches(pool, event.id),
        listMatchPools(pool, event.id),
        getLeaderboard(pool, event.id),
        listTournaments(pool, event.id),
        listShownSponsors(pool),
        listPlayedSeries(pool, event.id),
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
    return buildBigScreen({
        event: { id: event.id, name: event.name },
        matches,
        pools,
        live,
        leaderboard: leaderboard!,
        tournament: saved ? { id: saved.id, name: saved.name, format: saved.format, matches: saved.matches } : null,
        sponsors,
        series,
        rotation: event.bigScreen,
    });
}

/**
 * Everything the big screen shows for the active event. `wanted` picks the tournament of the
 * bracket. Without it, or when it is not a tournament of the event, the screen picks one. The
 * event code is left out unless `key` is the big screen key of the same event. With a `cache`,
 * the data may be up to its time to live old. The active event, its code and its key are always
 * read fresh, so a new key or another active event counts at once.
 */
export async function getBigScreen(pool: Pool, wanted: number | null = null, key: string | null = null, cache: TtlCache<BigScreenData> | null = null): Promise<BigScreenData> {
    const event = await getActiveEvent(pool);
    if (!event) return EMPTY_SCREEN;
    const build = () => buildScreen(pool, event, wanted);
    const [data, expected] = await Promise.all([cache ? cache.get(`${event.id}:${wanted ?? ''}`, build) : build(), getBigScreenKey(pool, event.id)]);
    return bigScreenKeyMatches(key, expected) ? { ...data, eventCode: event.code } : data;
}
