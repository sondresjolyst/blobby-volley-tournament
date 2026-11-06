import Link from 'next/link';
import { notFound } from 'next/navigation';
import { number, odds, percent, ratingChange, signed } from '@/components/stats/format';
import styles from '@/components/stats/stats.module.css';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { shownRating } from '@/lib/stats/elo';
import { getActiveEvent } from '@/lib/store/events';
import { getPlayerStats } from '@/lib/store/stats';

/** Every stat of one player in the event the player signed up to. */
export default async function PlayerStatsPage({ params }: { params: Promise<{ id: string }> }) {
    const id = parseId((await params).id);
    if (id === null) notFound();
    const pool = getPool();
    const [page, active] = await Promise.all([getPlayerStats(pool, id), getActiveEvent(pool)]);
    if (!page) notFound();
    const { player, stats, betting, elo, placings } = page;
    const name = (playerId: number) => page.nicknames.get(playerId) ?? `Spelar ${playerId}`;
    const back = active?.id === player.eventId ? '/leaderboard' : `/leaderboard?event=${player.eventId}`;

    return (
        <main lang="nn" className={styles.page}>
            <p>
                <Link href={back}>Tebake te topplista</Link>
            </p>
            <h1 className={styles.title}>{player.nickname}</h1>
            <p className={styles.subtitle}>Statistikk frå {player.eventName}</p>

            <dl className={`${styles.facts} ${styles.factsWide}`}>
                <div className={styles.fact}>
                    <dt>Elo</dt>
                    <dd>
                        <span className={styles.factValue}>{shownRating(elo.rating)}</span>
                        {ratingChange(elo.start, elo.rating)} dette LANet
                    </dd>
                </div>
                <div className={styles.fact}>
                    <dt>Kampar</dt>
                    <dd>
                        <span className={styles.factValue}>
                            {stats?.matchesWon ?? 0}-{stats?.matchesLost ?? 0}
                        </span>
                        {stats ? `${percent(stats.winRate)} vunne` : 'Ingen kampar enno'}
                    </dd>
                </div>
                <div className={styles.fact}>
                    <dt>Rette spel</dt>
                    <dd>
                        <span className={styles.factValue}>{betting?.correct ?? 0}</span>
                        {betting ? `av ${betting.bets} · ${percent(betting.hitRate)} treff` : 'Ingen spel avgjort enno'}
                    </dd>
                </div>
                <div className={styles.fact}>
                    <dt>Lengste rekke</dt>
                    <dd>
                        <span className={styles.factValue}>{stats?.longestStreak ?? 0}</span>
                        {stats?.longestStreak === 1 ? 'siger på rad' : 'sigra på rad'}
                    </dd>
                </div>
            </dl>

            <section aria-labelledby="kampar" className={styles.section}>
                <h2 id="kampar" className={styles.heading}>
                    Kampar
                </h2>
                {stats ? (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <tbody>
                                <tr>
                                    <th scope="row">Kampar vunne og tapt</th>
                                    <td>
                                        {stats.matchesWon} vunne · {stats.matchesLost} tapt
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row">Sett vunne og tapt</th>
                                    <td>
                                        {stats.gamesWon} vunne · {stats.gamesLost} tapt
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row">Vinn %</th>
                                    <td>{percent(stats.winRate)}</td>
                                </tr>
                                <tr>
                                    <th scope="row">Poeng scora og sluppe inn</th>
                                    <td>
                                        {number(stats.pointsScored)} scora · {number(stats.pointsConceded)} sluppe inn
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row">Lengste rekke</th>
                                    <td>{stats.longestStreak}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className={styles.empty}>Ingen ferdigspelte kampar enno. Ut på banen!</p>
                )}
            </section>

            <section aria-labelledby="plasseringar" className={styles.section}>
                <h2 id="plasseringar" className={styles.heading}>
                    Plasseringar
                </h2>
                {placings.length === 0 ? (
                    <p className={styles.empty}>Ingen plasseringar enno.</p>
                ) : (
                    <ul className={styles.plainList}>
                        {placings.map((p) => (
                            <li key={p.tournamentId}>
                                {p.place}. plass i {p.tournamentName}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section aria-labelledby="mot" className={styles.section}>
                <h2 id="mot" className={styles.heading}>
                    Mot kvar motstandar
                </h2>
                {!stats || stats.headToHead.length === 0 ? (
                    <p className={styles.empty}>Ingen motstandarar enno.</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col">Motstandar</th>
                                    <th scope="col">Vunne</th>
                                    <th scope="col">Tapt</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.headToHead.map((h) => (
                                    <tr key={h.opponentId}>
                                        <td>
                                            <Link href={`/leaderboard/players/${h.opponentId}`}>{name(h.opponentId)}</Link>
                                        </td>
                                        <td>{h.won}</td>
                                        <td>{h.lost}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section aria-labelledby="spel" className={styles.section}>
                <h2 id="spel" className={styles.heading}>
                    Spel
                </h2>
                {!betting ? (
                    <p className={styles.empty}>Ingen spel avgjort enno. Foza gjer seg ikkje sjøl!</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <tbody>
                                <tr>
                                    <th scope="row">Rette spel</th>
                                    <td>
                                        {betting.correct} av {betting.bets}
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row">Treff</th>
                                    <td>{percent(betting.hitRate)}</td>
                                </tr>
                                <tr>
                                    <th scope="row">Foza vunne</th>
                                    <td>{number(betting.fozaWon)}</td>
                                </tr>
                                <tr>
                                    <th scope="row">Foza tapt</th>
                                    <td>{number(betting.fozaLost)}</td>
                                </tr>
                                <tr>
                                    <th scope="row">Netto</th>
                                    <td>{signed(betting.net)}</td>
                                </tr>
                                <tr>
                                    <th scope="row">Største gevinst</th>
                                    <td>{betting.biggestWin ? `${signed(betting.biggestWin.value)} på ${name(betting.biggestWin.onPlayerId)}` : ''}</td>
                                </tr>
                                <tr>
                                    <th scope="row">Beste odds truffe</th>
                                    <td>{betting.bestOdds ? `${odds(betting.bestOdds.value)} på ${name(betting.bestOdds.onPlayerId)}` : ''}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}
