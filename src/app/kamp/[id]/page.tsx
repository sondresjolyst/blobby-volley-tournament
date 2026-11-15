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
import { getActiveEvent } from '@/lib/store/events';
import { getMatchStats } from '@/lib/store/game-stats';

/** The page of one match or training match: the stats of the whole match and of each game, and the live stats while it runs. */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
    await connection();
    const id = parseId((await params).id);
    if (id === null) notFound();
    const pool = getPool();
    const page = await getMatchStats(pool, id);
    if (!page) notFound();
    const header = await siteHeader(await getActiveEvent(pool));
    const training = page.kind === 'training';

    return (
        <SiteShell {...header} current={training ? '/trening' : undefined}>
            <div lang="nn" className={styles.page}>
                <p className={styles.back}>
                    <Link href={training ? '/trening' : '/bracket'}>{training ? MATCH_TEXT.backToTraining : MATCH_TEXT.backToBracket}</Link>
                </p>
                <h1 className={styles.title}>
                    {matchTitle(page)}
                    {training && <span className={styles.badge}>{TRAINING_TAG}</span>}
                </h1>
                <p className={styles.subtitle}>{settingsLine(page)}</p>
                {page.state === 'cancelled' ? (
                    <p className={styles.empty}>{MATCH_TEXT.cancelled}</p>
                ) : (
                    <>
                        <LiveMatchStats matchId={id} state={page.state} ids={page.playerIds} names={page.names} />
                        <FinishedGames names={page.names} ids={page.playerIds} games={page.games} totals={page.totals} />
                    </>
                )}
            </div>
        </SiteShell>
    );
}
