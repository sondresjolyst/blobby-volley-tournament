'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePolling } from '@/components/usePolling';
import type { LiveScore } from '@/lib/store/game-server';
import { GameBlock } from './MatchStats';
import { gameLines, pointsInOrder, type PlayerIds } from './match-view';
import { liveTitle, MATCH_TEXT } from './match-text';
import styles from './stats.module.css';

/** How often an open match page asks for the live stats. The game server posts them when the points change. */
export const LIVE_STATS_MS = 2000;

/** The states of a match that can still change, so the page keeps reading until it is finished or cancelled. */
const RUNNING = new Set(['upcoming', 'called', 'started']);

type Names = readonly [string | null, string | null];
type Live = Pick<LiveScore, 'state' | 'live' | 'stats'>;

/** Reads the live route at once and then every two seconds, and pauses in a hidden tab. It is only mounted while the match can change, so it stops by itself after. */
function Poller({ matchId, onLive }: { matchId: number; onLive: (live: Live) => void }) {
    usePolling<Live>(
        `/api/matches/${matchId}/live`,
        LIVE_STATS_MS,
        (result) => {
            if (result.ok) onLive(result.data);
        },
        { pauseWhenHidden: true, immediate: true },
    );
    return null;
}

/**
 * The game being played, with its live stats. It polls while the match is upcoming, called or started.
 * When a game ends or the match ends, the page data is loaded once more so the final stats show.
 */
export function LiveMatchStats({ matchId, state, ids, names }: { matchId: number; state: string; ids: PlayerIds; names: Names }) {
    const router = useRouter();
    const [data, setData] = useState<Live | null>(null);
    const game = useRef<number | null>(null);
    const current = data?.state ?? state;
    const running = RUNNING.has(state) && RUNNING.has(current);

    const onLive = (next: Live) => {
        const was = game.current;
        game.current = next.live?.game ?? null;
        setData(next);
        const ended = !RUNNING.has(next.state);
        const gameDone = was !== null && (next.live === null || next.live.game !== was);
        if (ended || gameDone) router.refresh();
    };

    const live = running ? data?.live : null;
    const points = live ? pointsInOrder(live.points, ids) : null;
    return (
        <div aria-live="off">
            {running && !live && <p className={styles.empty}>{current !== 'started' ? MATCH_TEXT.waiting : MATCH_TEXT.noStatsYet}</p>}
            {live && data && <GameBlock title={liveTitle(live.game)} score={points} names={names} lines={gameLines(data.stats, ids)} empty={MATCH_TEXT.noStatsYet} />}
            {running && <Poller matchId={matchId} onLive={onLive} />}
        </div>
    );
}
