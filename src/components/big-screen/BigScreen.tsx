'use client';
// The big screen for the TV in the room. It reads the scores again every few seconds without a
// page load, and the leaderboards take turns on a timer.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Pizza } from '@/components/pizza/Pizza';
import { usePolling } from '@/components/usePolling';
import { foza, payout } from '@/components/player/text';
import { currentBoard, nextBoard, REFRESH_MS, ROTATION_MS } from '@/lib/big-screen/rotation';
import { BOARD_ROWS, type BigScreenData, type BoardKey, type ScreenBracket, type ScreenMatch, type ScreenSponsor } from '@/lib/big-screen/view';
import { BOARD_TEXT, FREE_PLACE, joinLine, matchPill, moreMatches, SIDE_NAMES, NO_BRACKET, NO_EVENT, NO_MATCH, poolLine, slotScore } from './text';
import styles from './big.module.css';

export interface JoinQr {
    url: string;
    size: number;
    path: string;
}

function Hero({ match }: { match: ScreenMatch | null }) {
    if (!match) {
        return (
            <section className={`${styles.card} ${styles.heroEmpty}`} aria-label="Kampen no">
                <Pizza size={120} />
                <div>
                    <p className={styles.heroEmptyTitle}>{NO_MATCH.title}</p>
                    <p className={styles.muted}>{NO_MATCH.text}</p>
                </div>
            </section>
        );
    }
    const [a, b] = match.sides;
    const share = match.pool > 0 ? a.stake / match.pool : null;
    const center = match.live ? match.live.points : match.state === 'started' ? [a.sets, b.sets] : null;
    const sub = (sets: number, elo: number) => (match.state === 'upcoming' || match.state === 'called' ? `Elo ${elo}` : `${sets} sett · Elo ${elo}`);
    return (
        <section className={`${styles.card} ${styles.hero}`} aria-label="Kampen no">
            <div className={styles.heroScore}>
                <div className={styles.heroSide}>
                    <span className={styles.heroName}>{a.nickname}</span>
                    <span className={styles.muted}>{sub(a.sets, a.elo)}</span>
                </div>
                <div className={styles.heroPoints} aria-label={center ? `${center[0]} mot ${center[1]}` : 'mot'}>
                    {center ? (
                        <>
                            <span>{center[0]}</span>
                            <span className={styles.heroColon}>:</span>
                            <span>{center[1]}</span>
                        </>
                    ) : (
                        <span className={styles.heroVs}>vs</span>
                    )}
                </div>
                <div className={`${styles.heroSide} ${styles.heroSideRight}`}>
                    <span className={styles.heroName}>{b.nickname}</span>
                    <span className={styles.muted}>{sub(b.sets, b.elo)}</span>
                </div>
            </div>
            <p className={styles.heroCaption}>
                {match.live ? `Sett ${match.live.game} · best av ${match.bestOf}` : match.state === 'started' ? `Stillingen i sett · best av ${match.bestOf}` : `Best av ${match.bestOf}`}
                {match.tournamentName ? ` · ${match.tournamentName}` : ''}
            </p>
            <div className={styles.pool}>
                <div className={styles.poolBar} aria-hidden="true">
                    <div style={{ width: `${Math.round((share ?? 0.5) * 100)}%` }} className={share === null ? styles.poolEmpty : undefined} />
                </div>
                <div className={styles.poolText}>
                    {share === null ? (
                        <span>{poolLine(match)}</span>
                    ) : (
                        <>
                            <span>
                                {Math.round(share * 100)} % av {foza(match.pool)} · {payout(a.multiplier)}
                            </span>
                            <span>
                                {100 - Math.round(share * 100)} % · {payout(b.multiplier)}
                            </span>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

function Others({ matches }: { matches: ScreenMatch[] }) {
    if (matches.length === 0) return null;
    return (
        <section className={styles.others} aria-label="Snart i ringen">
            {matches.map((m) => (
                <article key={m.matchId} className={styles.other} aria-label={`${m.sides[0].nickname} mot ${m.sides[1].nickname}`}>
                    <span className={`${styles.tag} ${m.state === 'started' ? styles.tagLive : ''}`}>{matchPill(m).state}</span>
                    <span className={styles.otherNames}>
                        {m.sides[0].nickname} <span className={styles.muted}>vs</span> {m.sides[1].nickname}
                    </span>
                    <span className={styles.otherOdds}>
                        {m.live ? `${m.live.points[0]}–${m.live.points[1]}` : m.pool > 0 ? `${payout(m.sides[0].multiplier).replace('betale ', '')} / ${payout(m.sides[1].multiplier).replace('betale ', '')}` : 'Ingen spel enno'}
                    </span>
                </article>
            ))}
        </section>
    );
}

function Bracket({ bracket }: { bracket: ScreenBracket | null }) {
    if (!bracket) {
        return (
            <section className={styles.bracket} aria-label="Kampoppsett">
                <p className={styles.bracketHead}>KAMPOPPSETT</p>
                <p className={styles.muted}>{NO_BRACKET}</p>
            </section>
        );
    }
    return (
        <section className={styles.bracket} aria-label="Kampoppsett">
            <p className={styles.bracketHead}>
                KAMPOPPSETT · {bracket.name}
                {bracket.side ? ` · ${SIDE_NAMES[bracket.side]}` : ''}
            </p>
            <div className={styles.bracketBody} style={{ '--rows': bracket.rows, '--cols': Math.max(bracket.rounds.length, 1) } as CSSProperties}>
                {bracket.rounds.map((round) => (
                    <div key={round.key} className={styles.round}>
                        <span className={styles.roundName}>{round.name}</span>
                        <div className={styles.roundMatches}>
                            {round.matches.map((m) => (
                                <div key={m.matchId} className={`${styles.bracketCard} ${m.state === 'started' ? styles.bracketLive : ''}`}>
                                    {m.slots.map((slot, i) => (
                                        <div key={i} className={`${styles.slot} ${slot.outcome === 'won' ? styles.slotWon : slot.outcome === 'lost' ? styles.slotLost : ''}`}>
                                            <span>{slot.name}</span>
                                            <span>{slotScore(slot.score)}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                        {round.more > 0 && <span className={styles.roundMore}>{moreMatches(round.more)}</span>}
                    </div>
                ))}
            </div>
        </section>
    );
}

function Boards({ data, boardKey }: { data: BigScreenData; boardKey: BoardKey | null }) {
    const board = currentBoard(data.boards, boardKey);
    if (!board) return null;
    const text = BOARD_TEXT[board.key];
    return (
        <section className={styles.boards} aria-label="Toppliste">
            <h2 className={styles.boardTitle}>{text.title}</h2>
            <div className={styles.boardTabs}>
                {data.boards.map((b) => (
                    <span key={b.key} className={b.key === board.key ? styles.boardTabOn : styles.boardTab}>
                        {BOARD_TEXT[b.key].tab}
                    </span>
                ))}
            </div>
            {board.rows.length === 0 ? (
                <p className={styles.boardEmpty}>{text.empty}</p>
            ) : (
                <ol key={board.key} className={styles.boardRows} aria-label={text.title}>
                    {board.rows.map((row) => (
                        <li key={row.rank} className={styles.boardRow}>
                            <span className={styles.boardRank}>{row.rank}</span>
                            <span className={styles.boardName}>{row.nickname}</span>
                            <span>{row.value}</span>
                        </li>
                    ))}
                    {/* Free places keep the board the same height, so the box never looks half empty. */}
                    {Array.from({ length: BOARD_ROWS - board.rows.length }, (_, i) => (
                        <li key={`free-${i}`} className={`${styles.boardRow} ${styles.boardFree}`} aria-hidden="true">
                            <span className={styles.boardRank}>{board.rows.length + i + 1}</span>
                            <span className={styles.boardName}>{FREE_PLACE}</span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

/** The sign-up card. It only shows with the big screen key, since it holds the event code. */
function Join({ code, qr }: { code: string; qr: JoinQr | null }) {
    return (
        <section className={`${styles.card} ${styles.join}`} aria-label="Bli med">
            {qr && (
                <svg className={styles.qr} viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} role="img" aria-label={`QR-kode te ${qr.url}`}>
                    <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill="#fff8ec" />
                    <path d={qr.path} fill="#2a1a12" />
                </svg>
            )}
            <div className={styles.joinText}>
                <span className={styles.joinTitle}>Bli med å spel</span>
                <span className={styles.muted}>{joinLine(qr !== null)}</span>
                <span className={styles.joinCode}>{code}</span>
            </div>
        </section>
    );
}

function SponsorStrip({ sponsors }: { sponsors: ScreenSponsor[] }) {
    const box = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLUListElement>(null);
    const [moving, setMoving] = useState(false);
    useLayoutEffect(() => {
        const check = () => setMoving(!!box.current && !!list.current && list.current.scrollWidth > box.current.clientWidth);
        check();
        const observer = new ResizeObserver(check);
        if (box.current) observer.observe(box.current);
        return () => observer.disconnect();
    }, [sponsors]);
    if (sponsors.length === 0) return null;
    const items = (copy: boolean) =>
        sponsors.map((s) => (
            <li key={s.id} className={styles.sponsor}>
                {/* The logo is served as it was stored. The image optimizer of Next is not used. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt={copy ? '' : s.name} width={s.width} height={s.height} />
            </li>
        ));
    return (
        <footer className={styles.sponsors} aria-label="Sponsora">
            <span className={styles.sponsorLabel}>Stolt sponsa av</span>
            <div ref={box} className={styles.sponsorBox}>
                <div className={`${styles.sponsorTrack} ${moving ? styles.sponsorMoving : ''}`} style={{ '--count': sponsors.length } as CSSProperties}>
                    <ul ref={list} className={styles.sponsorList}>
                        {items(false)}
                    </ul>
                    {moving && (
                        <ul className={styles.sponsorList} aria-hidden="true">
                            {items(true)}
                        </ul>
                    )}
                </div>
            </div>
        </footer>
    );
}

/**
 * The whole screen. `tournament` is the `?t=` of the address and `screenKey` its `?key=`, kept for
 * the refresh. The key is only passed in when it matched, and the QR code only drawn then.
 */
export function BigScreen({ initial, tournament, screenKey, qr }: { initial: BigScreenData; tournament: number | null; screenKey: string | null; qr: JoinQr | null }) {
    const [data, setData] = useState(initial);
    const [boardKey, setBoardKey] = useState<BoardKey | null>(null);
    const latest = useRef(data);
    useEffect(() => {
        latest.current = data;
    }, [data]);

    const params = new URLSearchParams();
    if (tournament !== null) params.set('t', String(tournament));
    if (screenKey !== null) params.set('key', screenKey);
    const query = params.toString();
    usePolling<BigScreenData>(`/api/big${query ? `?${query}` : ''}`, REFRESH_MS, (result) => {
        // On a failed read the screen keeps the last numbers and tries again.
        if (!result.ok) return;
        // Another event went live. The code and the QR code come from the server, so load the page again.
        if (result.data.eventId !== initial.eventId) window.location.reload();
        else setData(result.data);
    });

    useEffect(() => {
        const timer = setInterval(() => setBoardKey((key) => nextBoard(latest.current.boards, currentBoard(latest.current.boards, key)?.key ?? null)), ROTATION_MS);
        return () => clearInterval(timer);
    }, []);

    if (data.eventId === null) {
        return (
            <main className={styles.screen} lang="nn">
                <div className={styles.noEvent}>
                    <Pizza size={200} />
                    <h1 className={styles.noEventTitle}>{NO_EVENT.title}</h1>
                    <p className={styles.muted}>{NO_EVENT.text}</p>
                </div>
            </main>
        );
    }

    const pill = data.featured ? matchPill(data.featured) : null;
    return (
        <main className={styles.screen} lang="nn">
            <div className={styles.grid}>
                <div className={styles.left}>
                    <header className={styles.top}>
                        <h1 className={styles.brand}>
                            <Pizza size={72} className={styles.brandPizza} />
                            {data.eventName}
                        </h1>
                        {pill && <span className={`${styles.pill} ${data.featured?.state === 'started' ? styles.pillLive : ''}`}>{`${pill.state} · ${pill.label}`}</span>}
                    </header>
                    <Hero match={data.featured} />
                    <Others matches={data.others} />
                    <Bracket bracket={data.bracket} />
                </div>
                <aside className={styles.right}>
                    <Boards data={data} boardKey={boardKey} />
                    {data.eventCode !== null && <Join code={data.eventCode} qr={qr} />}
                </aside>
            </div>
            <SponsorStrip sponsors={data.sponsors} />
        </main>
    );
}
