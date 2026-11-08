import Link from 'next/link';
import { connection } from 'next/server';
import { Pizza } from '@/components/pizza/Pizza';
import p from '@/components/player/player.module.css';
import { matchTitle } from '@/components/matches/describe';
import { foza, matchSettings, payout } from '@/components/player/text';
import { SiteShell } from '@/components/site/SiteShell';
import s from '@/components/site/site.module.css';
import { eventDates } from '@/components/site/text';
import { LiveRefresh } from '@/components/LiveRefresh';
import { getPool } from '@/lib/db';
import { getActivePlayer } from '@/lib/players/current';
import { listMatchPools, type MatchPool } from '@/lib/store/bets';
import { getActiveEvent } from '@/lib/store/events';
import { liveStamp } from '@/lib/store/live';
import { listMatches, type MatchSummary } from '@/lib/store/matches';

/** How many upcoming matches the front page lists. The bracket has the rest. */
const UPCOMING_SHOWN = 6;

const isLive = (m: MatchSummary) => m.state === 'started' || m.state === 'called';
/** A 1v1 match that the asked player has not answered yet stays off the front page. */
const isPending = (m: MatchSummary) => m.tournamentId === null && m.state === 'upcoming' && m.acceptedAt === null;

function PublicMatch({ match, pool, signedIn }: { match: MatchSummary; pool: MatchPool | undefined; signedIn: boolean }) {
    const name = (slot: 0 | 1) => match.players[slot]?.nickname ?? 'Ikkje klart enno';
    const live = match.state === 'started';
    const tag = live ? 'LIVE' : match.state === 'called' ? 'Ropt opp' : pool?.open ? 'Spel opent' : 'Seinare';
    const sides = pool?.sides ?? [];
    return (
        <article className={p.card}>
            <div className={p.cardTop}>
                <span className={`${p.tag} ${isLive(match) ? p.tagLive : ''}`}>{tag}</span>
            </div>
            <h3 className={p.versus}>
                {name(0)} <span>vs</span> {name(1)}
            </h3>
            <p className={p.meta}>
                {matchTitle(match, 'player')} · {matchSettings(match)}
            </p>
            {live && (
                <p className={p.meta}>
                    Stilling {match.score1}-{match.score2}
                </p>
            )}
            {sides.length === 2 && pool && (
                <div className={s.odds}>
                    <span>
                        {name(0)} {payout(sides[0].multiplier)}
                    </span>
                    <span>
                        {name(1)} {payout(sides[1].multiplier)}
                    </span>
                </div>
            )}
            {pool && pool.total > 0 && <p className={p.meta}>Potten e på {foza(pool.total)}</p>}
            {signedIn && pool?.open && (
                <Link href={`/me#kamp-${match.id}`} className={s.cardLink}>
                    Sats på denne kampen
                </Link>
            )}
        </article>
    );
}

export default async function Home() {
    await connection();
    const pool = getPool();
    const event = await getActiveEvent(pool);
    // The stamp is read before the rest, so a change during the reads loads the page once more.
    const stamp = event ? await liveStamp(pool, event.id) : null;
    const player = event ? await getActivePlayer() : null;
    const shellPlayer = player && player.eventId === event?.id ? { nickname: player.nickname, balance: player.fozaBalance } : null;

    if (!event) {
        return (
            <SiteShell eventName={null} player={null}>
                <section className={s.hero} aria-labelledby="tittel">
                    <div className={s.heroText}>
                        <h1 id="tittel" className={s.heroTitle}>
                            Ingen LAN e i gang
                        </h1>
                        <p className={s.heroPitch}>Her blir det turnering i Blobby Volley og spel om Foza. Men ein admin må opna eit LAN før nogen kan bli med.</p>
                        <p className={s.heroNote}>
                            E du admin? <Link href="/admin">Gå te admin</Link> og opne eit LAN. Gamle LAN finn du på <Link href="/leaderboard">topplista</Link>.
                        </p>
                    </div>
                    <Pizza size={260} className={s.heroPizza} />
                </section>
            </SiteShell>
        );
    }

    const [matches, pools] = await Promise.all([listMatches(pool, event.id), listMatchPools(pool, event.id)]);
    const poolOf = new Map(pools.map((x) => [x.matchId, x]));
    const live = matches.filter(isLive).sort((a, b) => (a.state === b.state ? a.id - b.id : a.state === 'started' ? -1 : 1));
    const upcoming = matches.filter((m) => m.state === 'upcoming' && !isPending(m) && m.players.some((x) => x !== null)).sort((a, b) => a.id - b.id);
    const dates = eventDates(event.startsOn, event.endsOn);

    return (
        <SiteShell eventName={event.name} player={shellPlayer}>
            <LiveRefresh eventId={event.id} stamp={stamp!} />
            <section className={s.hero} aria-labelledby="tittel">
                <div className={s.heroText}>
                    {dates && <p className={s.heroDates}>{dates}</p>}
                    <h1 id="tittel" className={s.heroTitle}>
                        {event.name}
                    </h1>
                    {shellPlayer ? (
                        <>
                            <p className={s.heroPitch}>
                                Hei, {shellPlayer.nickname}! Du har {foza(shellPlayer.balance)} å spela for. Sjå kampane dine, sats på dei andre og utfordra nogen te 1v1.
                            </p>
                            <div className={s.heroActions}>
                                <Link href="/me" className={p.joinButton}>
                                    Gå te sidå di
                                </Link>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className={s.heroPitch}>
                                Blobby Volley-turnering med pizza og ostepopp. Bli med, så får du {foza(event.startingFoza)} å satsa på kampane.
                            </p>
                            <div className={s.heroActions}>
                                <Link href="/join" className={p.joinButton}>
                                    Bli med på LANet
                                </Link>
                                <Link href="/login" className={s.heroSecondary}>
                                    Logg inn
                                </Link>
                            </div>
                        </>
                    )}
                </div>
                <Pizza size={260} className={s.heroPizza} />
            </section>

            <div className={p.column}>
                <section className={p.section} aria-labelledby="i-ringen">
                    <h2 id="i-ringen" className={p.h2}>
                        I ringen no
                    </h2>
                    {live.length === 0 ? (
                        <p className={p.muted}>Ingen kampar e i gang akkurat no.</p>
                    ) : (
                        <div className={p.cards}>
                            {live.map((m) => (
                                <PublicMatch key={m.id} match={m} pool={poolOf.get(m.id)} signedIn={shellPlayer !== null} />
                            ))}
                        </div>
                    )}
                </section>

                <section className={p.section} aria-labelledby="snart">
                    <div className={p.sectionHead}>
                        <h2 id="snart" className={p.h2}>
                            Snart i ringen
                        </h2>
                        {upcoming.length > UPCOMING_SHOWN && (
                            <Link href="/bracket" className={p.buttonQuiet}>
                                Sjå alle kampane
                            </Link>
                        )}
                    </div>
                    {upcoming.length === 0 ? (
                        <p className={p.empty}>Ingen kampar enno. Ta deg ei øl og nokon nædæ.</p>
                    ) : (
                        <div className={p.cards}>
                            {upcoming.slice(0, UPCOMING_SHOWN).map((m) => (
                                <PublicMatch key={m.id} match={m} pool={poolOf.get(m.id)} signedIn={shellPlayer !== null} />
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <aside className={p.aside}>
                <section className={`${p.panel} ${p.panelYellow}`} aria-labelledby="folg-med">
                    <h2 id="folg-med" className={p.h2}>
                        Følg med
                    </h2>
                    <ul className={s.links}>
                        <li>
                            <Link href="/bracket" className={s.linkCard}>
                                <span className={s.linkTitle}>Kampoppsett</span>
                                <span className={s.linkText}>Heile turneringa, runde for runde.</span>
                            </Link>
                        </li>
                        <li>
                            <Link href="/leaderboard" className={s.linkCard}>
                                <span className={s.linkTitle}>Toppliste</span>
                                <span className={s.linkText}>Kem som treff best med Foza, kem som vinne mest, og Elo.</span>
                            </Link>
                        </li>
                        <li>
                            <Link href="/big" className={s.linkCard}>
                                <span className={s.linkTitle}>Storskjermen</span>
                                <span className={s.linkText}>Live-stilling og kampoppsett.</span>
                            </Link>
                        </li>
                    </ul>
                </section>
                <section className={p.panel} aria-labelledby="sann">
                    <h2 id="sann" className={p.h2}>
                        Sånn funke det
                    </h2>
                    <ol className={s.steps}>
                        <li>Bli med med LAN-koden, eit kallenavn og ein PIN-kode.</li>
                        <li>Sats Foza på kampane du trur du kan lesa.</li>
                        <li>Når kampen din blir ropt opp, kopiere du lenkjå på sidå di og hoppe inn i spelet.</li>
                    </ol>
                </section>
            </aside>
        </SiteShell>
    );
}
