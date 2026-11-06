import Link from 'next/link';
import { notFound } from 'next/navigation';
import { number, odds, percent, ratingChange, signed } from '@/components/stats/format';
import styles from '@/components/stats/stats.module.css';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { shownRating } from '@/lib/stats/elo';
import { listEvents, type EventRow } from '@/lib/store/events';
import { getLeaderboard, type Leaderboard } from '@/lib/store/stats';
import { listTournaments } from '@/lib/store/tournaments';

type Search = Record<string, string | string[] | undefined>;

const BOARDS = { foza: 'Foza', sigra: 'Sigra', elo: 'Elo' } as const;
type Board = keyof typeof BOARDS;

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

interface View {
    event: EventRow;
    tournamentId: number | null;
    board: Board;
}

function href(view: View, change: Partial<View>): string {
    const next = { ...view, ...change };
    const params = new URLSearchParams();
    if (!next.event.isActive) params.set('event', String(next.event.id));
    if (next.tournamentId !== null) params.set('tournament', String(next.tournamentId));
    if (next.board !== 'foza') params.set('board', next.board);
    const query = params.toString();
    return query ? `/leaderboard?${query}` : '/leaderboard';
}

interface Row {
    playerId: number;
    detail: string;
    value: string;
}

function rowsFor(board: Board, data: Leaderboard): Row[] {
    const where = data.tournamentId === null ? 'dette LANet' : 'i denne turneringa';
    switch (board) {
        case 'foza':
            return data.bettors.map((b) => ({ playerId: b.playerId, detail: `${b.correct} av ${b.bets} spel rett · ${percent(b.hitRate)}`, value: `${b.correct} rette` }));
        case 'sigra':
            return data.wins.map((s) => ({ playerId: s.playerId, detail: `${s.matchesWon} vunne · ${s.matchesLost} tapt · ${percent(s.winRate)}`, value: String(s.matchesWon) }));
        case 'elo':
            return data.elo.map((e) => ({
                playerId: e.playerId,
                detail: `${data.tournamentId === null ? ratingChange(e.start, e.rating) : signed(e.change)} ${where}`,
                value: String(shownRating(e.rating)),
            }));
    }
}

const EMPTY: Record<Board, string> = {
    foza: 'Ingen spel e avgjort enno. Sett nokke Foza på ein kamp, då!',
    sigra: 'Ingen kampar e ferdigspelt enno. Det tar seg opp, sjå.',
    elo: 'Ingen spelarar her enno.',
};

/** The leaderboards of the active event, or of a past one, for the whole event or one tournament. */
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Search> }) {
    const search = await searchParams;
    const pool = getPool();
    const events = await listEvents(pool);
    const eventParam = one(search.event);
    const event = eventParam ? events.find((e) => e.id === parseId(eventParam)) : (events.find((e) => e.isActive) ?? events[0]);
    if (eventParam && !event) notFound();
    if (!event) {
        return (
            <main lang="nn" className={styles.page}>
                <h1 className={styles.title}>Toppliste</h1>
                <p className={styles.empty}>Her e det ingen LAN enno. Kom tebake når det e i gang!</p>
            </main>
        );
    }
    const tournamentParam = one(search.tournament);
    const tournamentId = tournamentParam ? parseId(tournamentParam) : null;
    if (tournamentParam && tournamentId === null) notFound();
    const boardParam = one(search.board);
    const board: Board = Object.hasOwn(BOARDS, boardParam) ? (boardParam as Board) : 'foza';

    const [data, tournaments] = await Promise.all([getLeaderboard(pool, event.id, tournamentId), listTournaments(pool, event.id)]);
    if (!data) notFound();
    const view: View = { event, tournamentId, board };
    const name = (id: number) => data.nicknames.get(id) ?? `Spelar ${id}`;
    const rows = rowsFor(board, data);
    const past = events.filter((e) => e.id !== event.id);

    const biggest = data.bettors.filter((b) => b.biggestWin).sort((a, b) => b.biggestWin!.value - a.biggestWin!.value)[0];
    const bestOdds = data.bettors.filter((b) => b.bestOdds).sort((a, b) => b.bestOdds!.value - a.bestOdds!.value)[0];
    const streak = [...data.wins].sort((a, b) => b.longestStreak - a.longestStreak)[0];
    const scorer = [...data.wins].sort((a, b) => b.pointsScored - a.pointsScored)[0];
    const facts = [
        biggest && { label: 'Største gevinst', value: signed(biggest.biggestWin!.value), who: `${name(biggest.playerId)} på ${name(biggest.biggestWin!.onPlayerId)}` },
        streak && streak.longestStreak > 0 && { label: 'Lengste rekke', value: `${streak.longestStreak} ${streak.longestStreak === 1 ? 'siger' : 'sigra'}`, who: name(streak.playerId) },
        bestOdds && { label: 'Beste odds truffe', value: odds(bestOdds.bestOdds!.value), who: name(bestOdds.playerId) },
        scorer && { label: 'Poeng scora', value: number(scorer.pointsScored), who: name(scorer.playerId) },
    ].filter((f) => !!f);

    const podium = tournamentId === null ? [] : data.placings;

    return (
        <main lang="nn" className={styles.page}>
            <h1 className={styles.title}>Toppliste</h1>
            <p className={styles.subtitle}>
                {event.name}
                {!event.isActive && ' · tidlegare LAN'}
            </p>

            <nav aria-label="Kor mykje av LANet">
                <ul className={styles.tabs}>
                    <li>
                        <Link href={href(view, { tournamentId: null })} aria-current={tournamentId === null ? 'page' : undefined}>
                            Heile LANet
                        </Link>
                    </li>
                    {tournaments.map((t) => (
                        <li key={t.id}>
                            <Link href={href(view, { tournamentId: t.id })} aria-current={tournamentId === t.id ? 'page' : undefined}>
                                {t.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
            <nav aria-label="Toppliste for">
                <ul className={styles.chips}>
                    {(Object.keys(BOARDS) as Board[]).map((b) => (
                        <li key={b}>
                            <Link href={href(view, { board: b })} aria-current={board === b ? 'page' : undefined}>
                                {BOARDS[b]}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className={styles.columns}>
                <section aria-label={`Toppliste ${BOARDS[board]}`}>
                    {board === 'foza' && <p className={styles.subtitle}>Flest rette spel vinn. Kor mykje Foza du har, bryr me oss ikkje om her.</p>}
                    {rows.length === 0 ? (
                        <p className={styles.empty}>{EMPTY[board]}</p>
                    ) : (
                        <ol className={styles.rows}>
                            {rows.map((row, i) => (
                                <li key={row.playerId} className={styles.row}>
                                    <span className={styles.rank} aria-hidden="true">
                                        {i + 1}
                                    </span>
                                    <span className={styles.who}>
                                        <Link className={styles.name} href={`/leaderboard/players/${row.playerId}`}>
                                            {name(row.playerId)}
                                        </Link>
                                        <span className={styles.detail}>{row.detail}</span>
                                    </span>
                                    <span className={styles.value}>{row.value}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>

                <div>
                    {podium.length > 0 && (
                        <section aria-labelledby="pallen">
                            <h2 id="pallen" className={styles.heading}>
                                Pallen
                            </h2>
                            <ol className={styles.podium}>
                                {podium.map((p) => (
                                    <li key={p.playerId} value={p.place}>
                                        {p.place}. plass: {name(p.playerId)}
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}
                    <section aria-labelledby="fakta" className={podium.length > 0 ? styles.section : undefined}>
                        <h2 id="fakta" className={styles.heading}>
                            Morosame fakta
                        </h2>
                        {facts.length === 0 ? (
                            <p className={styles.empty}>Ingen fakta enno. Dei kjem når ballen fyk.</p>
                        ) : (
                            <dl className={styles.facts}>
                                {facts.map((f) => (
                                    <div key={f.label} className={styles.fact}>
                                        <dt>{f.label}</dt>
                                        <dd>
                                            <span className={styles.factValue}>{f.value}</span>
                                            {f.who}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </section>
                </div>
            </div>

            <section aria-labelledby="alle-tala" className={styles.section}>
                <h2 id="alle-tala" className={styles.heading}>
                    Alle tala
                </h2>
                <AllNumbers board={board} data={data} name={name} />
            </section>

            {past.length > 0 && (
                <section aria-labelledby="tidlegare" className={styles.section}>
                    <h2 id="tidlegare" className={styles.heading}>
                        {event.isActive ? 'Tidlegare LAN' : 'Andre LAN'}
                    </h2>
                    <ul className={styles.plainList}>
                        {past.map((e) => (
                            <li key={e.id}>
                                <Link href={href({ event: e, tournamentId: null, board }, {})}>{e.name}</Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
}

function AllNumbers({ board, data, name }: { board: Board; data: Leaderboard; name: (id: number) => string }) {
    if (board === 'foza') {
        if (data.bettors.length === 0) return <p className={styles.empty}>{EMPTY.foza}</p>;
        return (
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th scope="col">Spelar</th>
                            <th scope="col">Rette</th>
                            <th scope="col">Spel</th>
                            <th scope="col">Treff</th>
                            <th scope="col">Foza vunne</th>
                            <th scope="col">Foza tapt</th>
                            <th scope="col">Netto</th>
                            <th scope="col">Største gevinst</th>
                            <th scope="col">Beste odds</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.bettors.map((b) => (
                            <tr key={b.playerId}>
                                <td>{name(b.playerId)}</td>
                                <td>{b.correct}</td>
                                <td>{b.bets}</td>
                                <td>{percent(b.hitRate)}</td>
                                <td>{number(b.fozaWon)}</td>
                                <td>{number(b.fozaLost)}</td>
                                <td>{signed(b.net)}</td>
                                <td>{b.biggestWin ? signed(b.biggestWin.value) : ''}</td>
                                <td>{b.bestOdds ? odds(b.bestOdds.value) : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    if (board === 'sigra') {
        if (data.wins.length === 0) return <p className={styles.empty}>{EMPTY.sigra}</p>;
        return (
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th scope="col">Spelar</th>
                            <th scope="col">Kampar vunne</th>
                            <th scope="col">Kampar tapt</th>
                            <th scope="col">Vinn %</th>
                            <th scope="col">Sett vunne</th>
                            <th scope="col">Sett tapt</th>
                            <th scope="col">Poeng scora</th>
                            <th scope="col">Poeng sluppe inn</th>
                            <th scope="col">Lengste rekke</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.wins.map((s) => (
                            <tr key={s.playerId}>
                                <td>{name(s.playerId)}</td>
                                <td>{s.matchesWon}</td>
                                <td>{s.matchesLost}</td>
                                <td>{percent(s.winRate)}</td>
                                <td>{s.gamesWon}</td>
                                <td>{s.gamesLost}</td>
                                <td>{number(s.pointsScored)}</td>
                                <td>{number(s.pointsConceded)}</td>
                                <td>{s.longestStreak}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    if (data.elo.length === 0) return <p className={styles.empty}>{EMPTY.elo}</p>;
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">Spelar</th>
                        <th scope="col">Elo</th>
                        <th scope="col">Inn i LANet</th>
                        <th scope="col">{data.tournamentId === null ? 'Endring dette LANet' : 'Endring i turneringa'}</th>
                        <th scope="col">Kampar med Elo</th>
                    </tr>
                </thead>
                <tbody>
                    {data.elo.map((e) => (
                        <tr key={e.playerId}>
                            <td>{name(e.playerId)}</td>
                            <td>{shownRating(e.rating)}</td>
                            <td>{shownRating(e.start)}</td>
                            <td>{data.tournamentId === null ? ratingChange(e.start, e.rating) : signed(e.change)}</td>
                            <td>{e.matches}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
