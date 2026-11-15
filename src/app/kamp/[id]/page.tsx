import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { siteHeader } from '@/components/site/header';
import { SiteShell } from '@/components/site/SiteShell';
import { FinishedGames } from '@/components/stats/MatchStats';
import { LiveMatchStats } from '@/components/stats/LiveMatchStats';
import { MATCH_TEXT, matchTitle, settingsLine } from '@/components/stats/match-text';
import styles from '@/components/stats/stats.module.css';
import { TRAINING_TAG } from '@/components/training/text';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getActiveEvent, getEvent } from '@/lib/store/events';
import { getMatchStats } from '@/lib/store/game-stats';

/** The page of one match or training match: the stats of the whole match and of each game, and the live stats while it runs. */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
    await connection();
    const id = parseId((await params).id);
    if (id === null) notFound();
    const pool = getPool();
    const page = await getMatchStats(pool, id);
    if (!page) notFound();
    const [active, event] = await Promise.all([getActiveEvent(pool), getEvent(pool, page.eventId)]);
    // The header shows the event of the match. The back link goes to the results of the active event, or to the leaderboard of an old one.
    const header = await siteHeader(event);
    const isActive = active?.id === page.eventId;
    const back = isActive ? { href: '/resultat', text: MATCH_TEXT.backToResults } : { href: `/leaderboard?event=${page.eventId}`, text: MATCH_TEXT.backToLeaderboard };
    const training = page.kind === 'training';

    return (
        <SiteShell {...header} current={isActive ? '/resultat' : undefined}>
            <div lang="nn" className={styles.page}>
                <p className={styles.back}>
                    <Link href={back.href}>{back.text}</Link>
                </p>
                <h1 className={styles.title}>
                    {matchTitle(page)}
                    {training && <span className={styles.badge}>{TRAINING_TAG}</span>}
                </h1>
                <p className={styles.subtitle}>{settingsLine(page)}</p>
                {page.state === 'cancelled' && <p className={styles.empty}>{MATCH_TEXT.cancelled}</p>}
                {page.state !== 'cancelled' && <LiveMatchStats matchId={id} state={page.state} ids={page.playerIds} names={page.names} />}
                <FinishedGames names={page.names} ids={page.playerIds} games={page.games} totals={page.totals} score={page.score} walkover={page.result === 'forfeit'} />
            </div>
        </SiteShell>
    );
}
