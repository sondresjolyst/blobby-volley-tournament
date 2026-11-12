import type { MatchPool } from '@/lib/store/bets';
import type { MatchSummary } from '@/lib/store/matches';
import { nicknameOf } from '@/lib/stats/players';
import { InfoLabel } from '../InfoButton';
import { FIELD_INFO } from './info';
import styles from './player.module.css';
import { BETS_OPEN, calledText, STATE_TAGS } from '@/lib/tournaments/board';
import { NOT_DECIDED } from '@/lib/texts';
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
    if (match.state === 'started') return { text: 'LIVE · stengt for betting', live: true };
    if (match.state === 'called') {
        const called = calledText(match.tournamentId !== null).tag;
        return { text: open ? `${called} · ${BETS_OPEN.toLowerCase()}` : called, live: true };
    }
    return { text: open ? BETS_OPEN : STATE_TAGS.upcoming, live: false };
}

const percent = (part: number, total: number) => (total === 0 ? 50 : Math.round((part / total) * 100));

/** A match that has not been played yet, with its pool and a bet form while bets are open. */
export function MatchCard({ match, pool, viewerId, balance, bet }: CardProps) {
    const open = pool?.open ?? false;
    const mine = match.players.some((p) => p?.id === viewerId);
    const tag = tagOf(match, open);
    const name = (slot: 0 | 1) => match.players[slot]?.nickname ?? NOT_DECIDED;
    const sides = pool?.sides ?? [];
    const nickname = nicknameOf(new Map(match.players.flatMap((p) => (p ? [[p.id, p.nickname] as const] : []))));
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
                    Stilling {match.score1}–{match.score2}
                </p>
            )}
            {sides.length === 2 && (
                <>
                    <div className={styles.poolBar} aria-hidden="true">
                        <span style={{ width: `${percent(sides[0].stake, pool!.total)}%` }} />
                    </div>
                    <div className={styles.poolText}>
                        <span>
                            {pool!.total === 0 ? 'Ingen har satsa ennå' : `${percent(sides[0].stake, pool!.total)} % av ${foza(pool!.total)}`}
                        </span>
                        {pool!.total > 0 && <span>{percent(sides[1].stake, pool!.total)} %</span>}
                    </div>
                </>
            )}
            {open && (
                <form method="post" action="/api/player/bets" className={styles.betForm}>
                    <fieldset>
                        <legend className={styles.srOnly}>
                            Sats på {name(0)} mot {name(1)}
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
                                    <span className={styles.sideName}>{nickname(side.playerId)}</span>
                                    <span className={styles.sideOdds}>
                                        {foza(side.stake)} · {payout(side.multiplier)}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div className={styles.stakeRow}>
                            <div className={styles.field}>
                                <InfoLabel htmlFor={`amount-${match.id}`} text="Kor mykje Foza tør du?" info={FIELD_INFO.stake.label}>
                                    <p>{FIELD_INFO.stake.text}</p>
                                </InfoLabel>
                                <input id={`amount-${match.id}`} aria-describedby={`amount-${match.id}-help`} className={styles.input} name="amount" type="number" min={1} max={Math.max(1, balance)} step={1} required inputMode="numeric" />
                            </div>
                            <button type="submit" className={styles.button} data-busy-label="Satse…">
                                {bet ? 'Høgn bettet' : 'Sats'}
                            </button>
                        </div>
                        <p className={styles.closingNote}>Betting stenge når kampen starte.</p>
                    </fieldset>
                </form>
            )}
        </article>
    );
}
