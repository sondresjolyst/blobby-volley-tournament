import Link from 'next/link';
import { connection } from 'next/server';
import { GameList } from '@/components/stats/GameList';
import { RESULT_TEXT } from '@/components/stats/game-list-text';
import styles from '@/components/stats/stats.module.css';
import { siteHeader } from '@/components/site/header';
import { SiteShell } from '@/components/site/SiteShell';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { NO_LAN, NO_LAN_OPEN } from '@/lib/texts';
import { getActiveEvent } from '@/lib/store/events';
import { listEventGames } from '@/lib/store/game-list';
import { listPlayers } from '@/lib/store/players';

type Search = { spelar?: string | string[]; mot?: string | string[] };

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

/** All the games of the active event, with a filter for one player or for two players. */
export default async function ResultPage({ searchParams }: { searchParams: Promise<Search> }) {
    await connection();
    const search = await searchParams;
    const pool = getPool();
    const event = await getActiveEvent(pool);
    const header = await siteHeader(event);
    if (!event) {
        return (
            <SiteShell {...header} current="/resultat">
                <div lang="nn" className={styles.page}>
                    <h1 className={styles.title}>{NO_LAN}</h1>
                    <p className={styles.empty}>{NO_LAN_OPEN}</p>
                </div>
            </SiteShell>
        );
    }
    const players = await listPlayers(pool, event.id);
    const known = new Set(players.map((p) => p.id));
    const asked = parseId(one(search.spelar));
    const playerId = asked !== null && known.has(asked) ? asked : undefined;
    const against = parseId(one(search.mot));
    const opponentId = playerId !== undefined && against !== null && against !== playerId && known.has(against) ? against : undefined;
    const games = await listEventGames(pool, event.id, { playerId, opponentId });
    const filtered = playerId !== undefined;

    return (
        <SiteShell {...header} current="/resultat">
            <div lang="nn" className={styles.page}>
                <h1 className={styles.title}>{RESULT_TEXT.title}</h1>
                <p className={styles.subtitle}>{RESULT_TEXT.subtitle}</p>
                <form method="get" action="/resultat" className={styles.filter}>
                    <label>
                        {RESULT_TEXT.player}
                        <select name="spelar" defaultValue={playerId ?? ''}>
                            <option value="">{RESULT_TEXT.anyone}</option>
                            {players.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.nickname}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        {RESULT_TEXT.opponent}
                        <select name="mot" defaultValue={opponentId ?? ''}>
                            <option value="">{RESULT_TEXT.anyone}</option>
                            {players.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.nickname}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button type="submit">{RESULT_TEXT.filter}</button>
                    {filtered && <Link href="/resultat">{RESULT_TEXT.reset}</Link>}
                </form>
                {games.length === 0 ? (
                    <p className={styles.empty}>{filtered ? RESULT_TEXT.noneFiltered : RESULT_TEXT.none}</p>
                ) : (
                    <GameList games={games} />
                )}
            </div>
        </SiteShell>
    );
}
