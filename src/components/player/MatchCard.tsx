import type { MatchPool } from '@/lib/store/bets';
import type { MatchSummary } from '@/lib/store/matches';
import styles from './player.module.css';
import { matchTitle } from '../matches/describe';
import { foza, matchSettings, payout } from './text';

interface CardProps {
    match: MatchSummary;
    pool: MatchPool | undefined;
    /** The player who looks at the page. */
    viewerId: number;
    balance: number;
    /** The viewer's bet on this match that is not refunded. */
    bet: { onPlayerId: number; onNickname: string; amount: number } | undefined;
}

function tagOf(match: MatchSummary, open: boolean): { text: string; live: boolean } {
    if (match.state === 'started') return { text: 'LIVE · spelå e stengt', live: true };
    if (match.state === 'called') return { text: open ? 'Ropt opp · spel opent' : 'Ropt opp', live: true };
    return { text: open ? 'Spel opent' : 'Seinare', live: false };
}

const percent = (part: number, total: number) => (total === 0 ? 50 : Math.round((part / total) * 100));

/** A match that has not been played yet, with its pool and a bet form while bets are open. */
export function MatchCard({ match, pool, viewerId, balance, bet }: CardProps) {
    const open = pool?.open ?? false;
    const mine = match.players.some((p) => p?.id === viewerId);
    const tag = tagOf(match, open);
    const name = (slot: 0 | 1) => match.players[slot]?.nickname ?? 'Ikkje klart enno';
    const sides = pool?.sides ?? [];
    const nicknameOf = (playerId: number) => match.players.find((p) => p?.id === playerId)?.nickname ?? `Spelar ${playerId}`;
    return (
        <article id={`kamp-${match.id}`} className={`${styles.card} ${mine ? styles.mine : ''}`}>
            <div className={styles.cardTop}>
                <span className={`${styles.tag} ${tag.live ? styles.tagLive : ''}`}>{tag.text}</span>
                {mine && <span className={`${styles.tag} ${styles.tagMine}`}>Din kamp</span>}
            </div>
            <h3 className={styles.versus}>
                {name(0)} <span>vs</span> {name(1)}
            </h3>
            <p className={styles.meta}>
                {matchTitle(match, 'player')} · {matchSettings(match)}
            </p>
            {match.state === 'started' && (
                <p className={styles.meta}>
                    Stilling {match.score1}-{match.score2}
                </p>
            )}
            {sides.length === 2 && (
                <>
                    <div className={styles.poolBar} aria-hidden="true">
                        <span style={{ width: `${percent(sides[0].stake, pool!.total)}%` }} />
                    </div>
                    <div className={styles.poolText}>
                        <span>
                            {pool!.total === 0 ? 'Ingen har satsa enno' : `${percent(sides[0].stake, pool!.total)} % av ${foza(pool!.total)}`}
                        </span>
                        {pool!.total > 0 && <span>{percent(sides[1].stake, pool!.total)} %</span>}
                    </div>
                </>
            )}
            {open && (
                <form method="post" action="/api/player/bets" className={styles.betForm}>
                    <fieldset>
                        <legend className={styles.srOnly}>
                            Sats på {name(0)} vs {name(1)}
                        </legend>
                        {bet && (
                            <p className={styles.meta}>
                                Du har satsa {foza(bet.amount)} på {bet.onNickname}.
                            </p>
                        )}
                        <input type="hidden" name="matchId" value={match.id} />
                        <div className={styles.sides}>
                            {sides.map((side) => (
                                <label key={side.playerId} className={styles.side}>
                                    <input type="radio" name="on" value={side.playerId} required defaultChecked={bet?.onPlayerId === side.playerId} disabled={bet !== undefined && bet.onPlayerId !== side.playerId} />
                                    <span className={styles.sideName}>{nicknameOf(side.playerId)}</span>
                                    <span className={styles.sideOdds}>
                                        {foza(side.stake)} · {payout(side.multiplier)}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div className={styles.stakeRow}>
                            <label className={styles.field}>
                                Kor mykje Foza tør du?
                                <input className={styles.input} name="amount" type="number" min={1} max={Math.max(1, balance)} step={1} required inputMode="numeric" />
                            </label>
                            <button type="submit" className={styles.button}>
                                {bet ? 'Høgn spelet' : 'Sats'}
                            </button>
                        </div>
                        <p className={styles.closingNote}>Spelå stenge når kampen starte.</p>
                    </fieldset>
                </form>
            )}
        </article>
    );
}
