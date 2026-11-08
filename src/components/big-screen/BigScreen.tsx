'use client';
// The big screen for the TV in the room. It reads the scores again every few seconds without a
// page load, the leaderboards take turns on a timer, and so do the screens the admin picked.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Pizza } from '@/components/pizza/Pizza';
import { usePolling } from '@/components/usePolling';
import { foza, payout } from '@/components/player/text';
import { currentBoard, nextBoard, REFRESH_MS, ROTATION_MS, screenMs, shownScreen, startScreenTurns } from '@/lib/big-screen/rotation';
import type { ScreenType } from '@/lib/big-screen/screens';
import { BOARD_ROWS, type BigScreenData, type BoardKey, type ScreenBracket, type ScreenMatch, type ScreenSponsor } from '@/lib/big-screen/view';
import { BoardPanel, BracketPanel, RankRows, ScreenTop, SponsorLogo } from './parts';
import { SiteContext, useSite } from './site';
import { SPONSORS_LABEL } from '@/components/site/text';
import { OtherScreen } from './screens';
import { BOARD_TEXT, joinLine, livePoints, matchOdds, matchPill, SIDE_NAMES, NO_EVENT, NO_MATCH, poolLine, SPONSOR_LABEL } from './text';
import styles from './big.module.css';

export interface JoinQr {
    url: string;
    size: number;
    path: string;
}

function Hero({ match }: { match: ScreenMatch | null }) {
    const site = useSite();
    if (!match) {
        return (
            <section className={`${styles.card} ${styles.heroEmpty}`} aria-label="Kampen nå">
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
        <section className={`${styles.card} ${styles.hero}`} aria-label="Kampen nå">
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
                {match.live ? `Sett ${match.live.game} · best av ${match.bestOf}` : match.state === 'started' ? `Sett vunne · best av ${match.bestOf}` : `Best av ${match.bestOf}`}
                {match.tournamentName ? ` · ${match.tournamentName}` : ''}
            </p>
            <div className={styles.pool}>
                <div className={styles.poolBar} aria-hidden="true">
                    <div style={{ width: `${Math.round((share ?? 0.5) * 100)}%` }} className={share === null ? styles.poolEmpty : undefined} />
                </div>
                <div className={styles.poolText}>
                    {share === null ? (
                        <span>{poolLine(match, site)}</span>
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
                    <span className={styles.otherOdds}>{m.live ? livePoints(m.live) : matchOdds(m)}</span>
                </article>
            ))}
        </section>
    );
}

function Bracket({ bracket }: { bracket: ScreenBracket | null }) {
    const head = bracket ? `KAMPOPPSETT · ${bracket.name}${bracket.side ? ` · ${SIDE_NAMES[bracket.side]}` : ''}` : 'KAMPOPPSETT';
    return <BracketPanel label="Kampoppsett" head={head} rounds={bracket?.rounds ?? null} rows={bracket?.rows ?? 1} />;
}

function Boards({ data, boardKey }: { data: BigScreenData; boardKey: BoardKey | null }) {
    const board = currentBoard(data.boards, boardKey);
    if (!board) return null;
    const text = BOARD_TEXT[board.key];
    return (
        <BoardPanel label="Toppliste" title={text.title}>
            <div className={styles.boardTabs}>
                {data.boards.map((b) => (
                    <span key={b.key} className={b.key === board.key ? styles.boardTabOn : styles.boardTab}>
                        {BOARD_TEXT[b.key].tab}
                    </span>
                ))}
            </div>
            {board.rows.length === 0 ? <p className={styles.boardEmpty}>{text.empty}</p> : <RankRows key={board.key} rows={board.rows} size={BOARD_ROWS} label={text.title} />}
        </BoardPanel>
    );
}

/** The sign-up card. It only shows with the big screen key, since it holds the event code. */
function Join({ code, qr }: { code: string; qr: JoinQr | null }) {
    const site = useSite();
    return (
        <section className={`${styles.card} ${styles.join}`} aria-label="Bli med">
            {qr && (
                <svg className={styles.qr} viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} role="img" aria-label={`QR-kode te ${qr.url}`}>
                    <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill="#fff8ec" />
                    <path d={qr.path} fill="#2a1a12" />
                </svg>
            )}
            <div className={styles.joinText}>
                <span className={styles.joinTitle}>Bli med og spel</span>
                <span className={styles.muted}>{joinLine(qr !== null, site)}</span>
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
    const items = (copy: boolean) => sponsors.map((s) => <SponsorLogo key={s.id} sponsor={s} copy={copy} />);
    return (
        <footer className={styles.sponsors} aria-label={SPONSORS_LABEL}>
            <span className={styles.sponsorLabel}>{SPONSOR_LABEL}</span>
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
 * `pinned` is the `?screen=` of the address, which keeps this TV on one screen.
 */
export function BigScreen({
    initial,
    tournament,
    screenKey,
    qr,
    pinned = null,
    site = null,
}: {
    initial: BigScreenData;
    tournament: number | null;
    screenKey: string | null;
    qr: JoinQr | null;
    pinned?: ScreenType | null;
    /** The host of the site for the addresses on the screen, such as `julalan.no`. */
    site?: string | null;
}) {
    const [data, setData] = useState(initial);
    const [boardKey, setBoardKey] = useState<BoardKey | null>(null);
    const [turn, setTurn] = useState(0);
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

    // The screens take turns. The timer starts over when the admin changes the screens or the time.
    const ms = screenMs(data);
    const order = data.rotation.screens.join(',');
    useEffect(() => startScreenTurns(ms, pinned, () => latest.current, setTurn), [pinned, ms, order]);

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

    const shown = shownScreen(data, turn, pinned);
    const pill = data.featured ? matchPill(data.featured) : null;
    return (
        <SiteContext.Provider value={site}>
            <main className={styles.screen} lang="nn" data-screen={shown}>
                {shown === 'overview' ? (
                    <div className={styles.grid}>
                        <div className={styles.left}>
                            <ScreenTop name={data.eventName}>
                                {pill && <span className={`${styles.pill} ${data.featured?.state === 'started' ? styles.pillLive : ''}`}>{`${pill.state} · ${pill.label}`}</span>}
                            </ScreenTop>
                            <Hero match={data.featured} />
                            <Others matches={data.others} />
                            <Bracket bracket={data.bracket} />
                        </div>
                        <aside className={styles.right}>
                            <Boards data={data} boardKey={boardKey} />
                            {data.eventCode !== null && <Join code={data.eventCode} qr={qr} />}
                        </aside>
                    </div>
                ) : (
                    <OtherScreen type={shown} data={data} />
                )}
                {shown !== 'sponsors' && <SponsorStrip sponsors={data.sponsors} />}
            </main>
        </SiteContext.Provider>
    );
}
