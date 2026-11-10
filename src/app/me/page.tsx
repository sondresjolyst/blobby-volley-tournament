import Link from 'next/link';
import { InfoButton, InfoLabel } from '@/components/InfoButton';
import { CopyJoinLink } from '@/components/player/CopyJoinLink';
import { FIELD_INFO } from '@/components/player/info';
import { MatchCard } from '@/components/player/MatchCard';
import { LiveRefresh } from '@/components/LiveRefresh';
import { Pizza } from '@/components/pizza/Pizza';
import { PlayerShell } from '@/components/player/PlayerShell';
import { RulesFields } from '@/components/player/RulesFields';
import styles from '@/components/player/player.module.css';
import { matchPlayers, matchTitle } from '@/components/matches/describe';
import { nicknameErrorMessage } from '@/components/players/messages';
import { BET_STATUS, challengeErrorMessage, dailyFozaLine, dailyFozaNotice, foza, matchSettings, noticeMessage } from '@/components/player/text';
import { BEST_OF } from '@/lib/bracket';
import { betErrorMessage } from '@/lib/betting/input';
import { getPool } from '@/lib/db';
import { DEFAULT_GAME_SPEED, MAX_GAME_SPEED, MIN_GAME_SPEED } from '@/lib/matches/settings';
import { rulesNote } from '@/lib/matches/rules';
import { NICKNAME_MAX_BYTES } from '@/lib/players/nickname';
import { requireActivePlayer } from '@/lib/players/current';
import { joinLink } from '@/lib/players/join-code';
import { listMatchPools, listPlayerBets } from '@/lib/store/bets';
import { getEvent } from '@/lib/store/events';
import { getWallet } from '@/lib/store/foza';
import { liveStamp } from '@/lib/store/live';
import { listMatches, type MatchSummary } from '@/lib/store/matches';
import { getJoinCode, listPlayers } from '@/lib/store/players';
import { calledText } from '@/lib/tournaments/board';
import { getPlayerTrainingStats, listLiveTraining } from '@/lib/store/training';
import { TrainingCard } from '@/components/training/TrainingCard';
import { OwnTrainingStats } from '@/components/training/TrainingStats';
import { TRAINING_TEXT } from '@/components/training/text';

type Search = {
    error?: string | string[];
    bet?: string | string[];
    challenge?: string | string[];
    challengeError?: string | string[];
    nickname?: string | string[];
    nicknameError?: string | string[];
};

// Live matches first, then called ones, then the rest in play order.
const STATE_ORDER = { started: 0, called: 1, upcoming: 2, finished: 3, cancelled: 3 } as const;

/** A 1v1 match that the asked player has not answered yet. */
const isPending = (m: MatchSummary) => m.tournamentId === null && m.state === 'upcoming' && m.acceptedAt === null;

export default async function Me({ searchParams }: { searchParams: Promise<Search> }) {
    const player = await requireActivePlayer();
    const pool = getPool();
    // The stamp is read before the data, so a change that commits during the reads loads the page once more.
    const stamp = await liveStamp(pool, player.eventId);
    const wallet = await getWallet(pool, player.id, new Date());
    const balance = wallet?.balance ?? player.fozaBalance;
    const dailyToday = wallet?.dailyToday ?? 0;
    const [matches, pools, bets, players, event, training, trainingStats] = await Promise.all([
        listMatches(pool, player.eventId),
        listMatchPools(pool, player.eventId),
        listPlayerBets(pool, player.id),
        listPlayers(pool, player.eventId),
        getEvent(pool, player.eventId),
        listLiveTraining(pool, player.eventId),
        getPlayerTrainingStats(pool, player.id),
    ]);
    const ownTraining = training.find((t) => t.playerId === player.id);
    const plays = (m: MatchSummary) => m.players.some((p) => p?.id === player.id);
    // A player is in at most one called or started match, since calling refuses a busy player.
    const current = matches.find((m) => (m.state === 'called' || m.state === 'started') && plays(m));
    // The join code is secret, so it is read only when the player has a match to join.
    const code = current && event?.serverHost && event.serverPort ? await getJoinCode(pool, player.id) : null;
    const join = code && event?.serverHost && event.serverPort ? joinLink(event.serverHost, event.serverPort, code) : null;

    const poolOf = new Map(pools.map((p) => [p.matchId, p]));
    const liveBet = new Map(bets.filter((b) => b.status !== 'refunded').map((b) => [b.matchId, b]));
    const matchOf = new Map(matches.map((m) => [m.id, m]));
    // A match with no player known yet is only shown on the bracket page.
    const ahead = matches.filter((m) => STATE_ORDER[m.state] < 3 && !isPending(m) && m.players.some((p) => p !== null)).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.id - b.id);
    // Started matches and trainings are in the ring now, the rest is coming up.
    const inRing = ahead.filter((m) => m.state === 'started');
    const soon = ahead.filter((m) => m.state !== 'started');
    const trainingInRing = training.filter((t) => t.state === 'started');
    const trainingSoon = training.filter((t) => t.state !== 'started');
    const incoming = matches.filter((m) => isPending(m) && m.players[1]?.id === player.id);
    const outgoing = matches.filter((m) => isPending(m) && m.players[0]?.id === player.id);
    const opponents = players.filter((p) => p.id !== player.id);

    const search = await searchParams;
    const betError = betErrorMessage(search.error);
    const betNotice = noticeMessage(search.bet);
    const challengeError = challengeErrorMessage(search.challengeError);
    const challengeNotice = noticeMessage(search.challenge);
    const nicknameError = nicknameErrorMessage(search.nicknameError);
    const nicknameNotice = search.nickname === 'changed' ? 'Kallenavnet ditt e bytta. Elo-en og alle kampa dine følge med.' : null;
    return (
        <PlayerShell page="matches" eventName={player.eventName} nickname={player.nickname} balance={balance}>
            {stamp !== null && <LiveRefresh eventId={player.eventId} stamp={stamp} />}
            <div className={styles.column}>
                <h1 className={styles.h1}>Hei, {player.nickname}!</h1>
                {dailyToday > 0 ? (
                    <p role="status" className={styles.notice}>
                        {dailyFozaNotice(dailyToday)}
                    </p>
                ) : (
                    event && event.dailyFoza > 0 && <p className={styles.muted}>{dailyFozaLine(event.dailyFoza)}</p>
                )}
                {betError && (
                    <p role="alert" className={styles.alert}>
                        {betError}
                    </p>
                )}
                {betNotice && (
                    <p role="status" className={styles.notice}>
                        {betNotice}
                    </p>
                )}

                {incoming.length > 0 && (
                    <p className={styles.notice}>
                        <a href="#utfordringa">{incoming.length === 1 ? 'Någen utfordre deg te 1v1. Svar her.' : `${incoming.length} spelara utfordre deg te 1v1. Svar her.`}</a>
                    </p>
                )}

                {ownTraining && (
                    <p className={styles.notice}>
                        <Link href="/trening#treninga-di">{TRAINING_TEXT.meReady}</Link>
                    </p>
                )}

                {current && (
                    <section className={styles.hero} aria-labelledby="din-kamp">
                        <Pizza size={160} variant="deluxe" className={styles.heroPizza} />
                        <p className={styles.kicker}>
                            {matchTitle(current, 'player')} · {matchSettings(current)}
                        </p>
                        <h2 id="din-kamp" className={styles.heroTitle}>
                            {current.state === 'called' ? calledText(current.tournamentId !== null).heading : 'Kampen din e i gang'}
                        </h2>
                        <p className={styles.heroVersus}>
                            {matchPlayers(current, 'player')}
                            {current.state === 'started' && ` · ${current.score1}–${current.score2}`}
                        </p>
                        {join && code && event?.serverHost && event.serverPort ? (
                            <>
                                <CopyJoinLink link={join} />
                                <ol className={styles.joinSteps} aria-label="Sånn kjem du inn">
                                    <li>Kopier lenkjå med knappen.</li>
                                    <li>
                                        Opne Blobby Volley. Har du det ikkje?{' '}
                                        <Link className={styles.heroLink} href="/last-ned">
                                            Last det ned
                                        </Link>
                                        .
                                    </li>
                                    <li>Trykk på &quot;join link&quot; øvst i hovudmenyen.</li>
                                    <li>Trykk &quot;join&quot; eller Enter.</li>
                                </ol>
                                <div className={styles.heroNote}>
                                    Lenkjå og koden e bare dine. Ikkje del dei. Mista du sambandet, gjer det same igjen.{' '}
                                    <InfoButton label="Kan eg opna lenkjå direkte?">
                                        <p>
                                            Ja, har du lenkjåtypen registrert på maskinå.{' '}
                                            <a className={styles.heroLink} href={join}>
                                                Opne lenkjå direkte
                                            </a>
                                            .
                                        </p>
                                    </InfoButton>
                                </div>
                                <div className={styles.joinManual}>
                                    <p className={styles.heroNote}>
                                        Vil du heller skriva det inn sjøl? Velg &quot;online game&quot; eller &quot;lan game&quot;, så &quot;direct connect&quot;. Skriv inn serveren, og bruk koden som navn.
                                    </p>
                                    <dl className={styles.joinFacts}>
                                        <div>
                                            <dt>Server</dt>
                                            <dd>
                                                {event.serverHost}:{event.serverPort}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Kode</dt>
                                            <dd>{code}</dd>
                                        </div>
                                    </dl>
                                </div>
                            </>
                        ) : (
                            <p className={styles.heroNote}>Spelserveren e ikkje klar ennå. Spør ein admin.</p>
                        )}
                    </section>
                )}

                <section className={styles.section} aria-labelledby="i-ringen">
                    <h2 id="i-ringen" className={styles.h2}>
                        I ringen nå
                    </h2>
                    {inRing.length === 0 && trainingInRing.length === 0 ? (
                        <p className={styles.empty}>Ingen kampa e i gang akkurat nå.</p>
                    ) : (
                        <div className={styles.cards}>
                            {inRing.map((m) => (
                                <MatchCard key={m.id} match={m} pool={poolOf.get(m.id)} viewerId={player.id} balance={balance} bet={liveBet.get(m.id)} />
                            ))}
                            {/* Training comes after the real matches and has no pool or bets. */}
                            {trainingInRing.map((t) => (
                                <TrainingCard key={`trening-${t.id}`} training={t} />
                            ))}
                        </div>
                    )}
                </section>

                <section className={styles.section} aria-labelledby="snart">
                    <div className={styles.sectionHead}>
                        <h2 id="snart" className={styles.h2}>
                            Snart i ringen
                        </h2>
                        <a href="#utfordra" className={styles.buttonQuiet}>
                            Utfordra någen te 1v1
                        </a>
                    </div>
                    {soon.length === 0 && trainingSoon.length === 0 ? (
                        <p className={styles.empty}>Ingen kampa ennå. Ta deg ei øl og någen nædæ.</p>
                    ) : (
                        <div className={styles.cards}>
                            {soon.map((m) => (
                                <MatchCard key={m.id} match={m} pool={poolOf.get(m.id)} viewerId={player.id} balance={balance} bet={liveBet.get(m.id)} />
                            ))}
                            {/* Training comes after the real matches and has no pool or bets. */}
                            {trainingSoon.map((t) => (
                                <TrainingCard key={`trening-${t.id}`} training={t} />
                            ))}
                        </div>
                    )}
                </section>

                <OwnTrainingStats stats={trainingStats} headingId="treninga" />
                <p>
                    <Link href="/trening" className={styles.buttonQuiet}>
                        {TRAINING_TEXT.meLink}
                    </Link>
                </p>

                <section className={styles.section} aria-labelledby="spel">
                    <h2 id="spel" className={styles.h2}>
                        Spelå dine
                    </h2>
                    {bets.length === 0 ? (
                        <p className={styles.muted}>Du har ikkje satsa någen Foza ennå.</p>
                    ) : (
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Kamp</th>
                                        <th>På</th>
                                        <th>Innsats</th>
                                        <th>Resultat</th>
                                        <th>Foza vunne eller tapt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bets.map((b) => {
                                        const m = matchOf.get(b.matchId);
                                        return (
                                            <tr key={b.id}>
                                                <td>{m ? matchPlayers(m, 'player') : `Kamp ${b.matchId}`}</td>
                                                <td>{b.onNickname}</td>
                                                <td>{foza(b.amount)}</td>
                                                <td>{BET_STATUS[b.status]}</td>
                                                <td className={b.net === null || b.net === 0 ? undefined : b.net > 0 ? styles.plus : styles.minus}>
                                                    {b.net === null ? '' : b.net > 0 ? `+${b.net}` : b.net}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            <aside className={styles.aside}>
                <section id="utfordringa" className={`${styles.panel} ${styles.panelYellow}`} aria-labelledby="utfordringa-tittel">
                    <h2 id="utfordringa-tittel" className={styles.h2}>
                        Utfordringa
                    </h2>
                    {challengeError && (
                        <p role="alert" className={styles.alert}>
                            {challengeError}
                        </p>
                    )}
                    {challengeNotice && (
                        <p role="status" className={styles.notice}>
                            {challengeNotice}
                        </p>
                    )}
                    {incoming.length === 0 && outgoing.length === 0 && <p className={styles.muted}>Ingen utfordringa akkurat nå.</p>}
                    {incoming.length > 0 && (
                        <ul className={styles.list} aria-label="Utfordringa te deg">
                            {incoming.map((m) => (
                                <li key={m.id} className={styles.challenge}>
                                    <strong>{m.players[0]?.nickname} utfordre deg!</strong>
                                    <span className={styles.meta}>{matchSettings(m)}</span>
                                    {rulesNote(m.ruleFile) && <span className={styles.meta}>{rulesNote(m.ruleFile)}</span>}
                                    <div className={styles.challengeButtons}>
                                        <form method="post" action={`/api/player/challenges/${m.id}`}>
                                            <input type="hidden" name="answer" value="accept" />
                                            <button type="submit" className={styles.button}>
                                                Godta
                                            </button>
                                        </form>
                                        <form method="post" action={`/api/player/challenges/${m.id}`}>
                                            <input type="hidden" name="answer" value="decline" />
                                            <button type="submit" className={styles.buttonQuiet}>
                                                Nei takk
                                            </button>
                                        </form>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {outgoing.length > 0 && (
                        <ul className={styles.list} aria-label="Utfordringa frå deg">
                            {outgoing.map((m) => (
                                <li key={m.id} className={styles.challenge}>
                                    <strong>Du vente på svar frå {m.players[1]?.nickname}</strong>
                                    <span className={styles.meta}>{matchSettings(m)}</span>
                                    <form method="post" action={`/api/player/challenges/${m.id}`}>
                                        <input type="hidden" name="answer" value="withdraw" />
                                        <button type="submit" className={styles.buttonQuiet}>
                                            Trekk tebake
                                        </button>
                                    </form>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section id="utfordra" className={styles.panel} aria-labelledby="utfordra-tittel">
                    <h2 id="utfordra-tittel" className={styles.h2}>
                        Utfordra någen te 1v1
                    </h2>
                    {opponents.length === 0 ? (
                        <p className={styles.muted}>Ingen andre e med ennå. Få någen te å bli med på LANet først.</p>
                    ) : (
                        <form method="post" action="/api/player/challenges" className={styles.challengeForm}>
                            <label className={styles.field}>
                                Motstandar
                                <select name="opponent" required className={styles.input} defaultValue="">
                                    <option value="" disabled>
                                        Velg någen
                                    </option>
                                    {opponents.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.nickname}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className={styles.field}>
                                <InfoLabel htmlFor="bestOf" text="Best av" info={FIELD_INFO.bestOf.label}>
                                    <p>{FIELD_INFO.bestOf.text}</p>
                                </InfoLabel>
                                <select id="bestOf" name="bestOf" aria-describedby="bestOf-help" className={styles.input} defaultValue="1">
                                    {BEST_OF.map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <RulesFields>
                                <div className={styles.field}>
                                    <InfoLabel htmlFor="speed" text="Fart" info={FIELD_INFO.speed.label}>
                                        <p>{FIELD_INFO.speed.text}</p>
                                    </InfoLabel>
                                    <input id="speed" name="speed" type="number" className={styles.input} min={MIN_GAME_SPEED} max={MAX_GAME_SPEED} step={1} defaultValue={DEFAULT_GAME_SPEED} required aria-describedby="speed-hint speed-help" />
                                    <span id="speed-hint" className={styles.hint}>
                                        bilde i sekundet, {MIN_GAME_SPEED} te {MAX_GAME_SPEED}, vanleg e {DEFAULT_GAME_SPEED}
                                    </span>
                                </div>
                            </RulesFields>
                            <button type="submit" className={styles.button}>
                                Send utfordring
                            </button>
                            <p className={styles.closingNote}>Når motstandaren godtar, kan dåkke spela med det same, så sant ingen av dåkke e midt i ein kamp.</p>
                        </form>
                    )}
                </section>

                <section id="kallenavn" className={styles.panel} aria-labelledby="kallenavn-tittel">
                    <h2 id="kallenavn-tittel" className={styles.h2}>
                        Bytt kallenavn
                    </h2>
                    {nicknameError && (
                        <p role="alert" className={styles.alert}>
                            {nicknameError}
                        </p>
                    )}
                    {nicknameNotice && (
                        <p role="status" className={styles.notice}>
                            {nicknameNotice}
                        </p>
                    )}
                    <form method="post" action="/api/player/nickname" className={styles.challengeForm}>
                        <label className={styles.field}>
                            Nytt kallenavn
                            <input name="nickname" required maxLength={NICKNAME_MAX_BYTES} defaultValue={player.nickname} autoComplete="nickname" className={styles.input} />
                        </label>
                        <button type="submit" className={styles.button}>
                            Bytt kallenavn
                        </button>
                        <p className={styles.closingNote}>Du logge inn med det nye kallenavnet. Elo-en og alle kampa dine følge med, også frå LAN du har vore på før.</p>
                    </form>
                </section>
            </aside>
        </PlayerShell>
    );
}
