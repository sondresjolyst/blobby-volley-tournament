// The pieces every screen of the big screen is built from, so each screen looks the same.
import type { CSSProperties, ReactNode } from 'react';
import { Pizza } from '@/components/pizza/Pizza';
import type { ScreenRound, ScreenSponsor } from '@/lib/big-screen/view';
import { FREE_PLACE, moreMatches, slotScore } from './text';
import styles from './big.module.css';

/** The top line: the pizza and the name of the event, with whatever the screen puts on the right. */
export function ScreenTop({ name, children }: { name: string | null; children?: ReactNode }) {
    return (
        <header className={styles.top}>
            <h1 className={styles.brand}>
                <Pizza size={72} className={styles.brandPizza} />
                {name}
            </h1>
            {children}
        </header>
    );
}

/** A yellow board with a title, like the leaderboards. */
export function BoardPanel({ label, title, children }: { label: string; title: string; children: ReactNode }) {
    return (
        <section className={styles.boards} aria-label={label}>
            <h2 className={styles.boardTitle}>{title}</h2>
            {children}
        </section>
    );
}

export interface RankRow {
    rank: number;
    nickname: string;
    value: string;
    /** A note after the name, such as `på Blobfisk`. */
    detail?: string;
}

/** Ranked rows of a board. Free places fill it up to `size`, so it never looks half empty. */
export function RankRows({ rows, size, label }: { rows: readonly RankRow[]; size: number; label: string }) {
    return (
        <ol className={styles.boardRows} aria-label={label}>
            {rows.map((row) => (
                <li key={row.rank} className={styles.boardRow}>
                    <span className={styles.boardRank}>{row.rank}</span>
                    <span className={styles.boardName}>
                        {row.nickname}
                        {row.detail && <span className={styles.boardDetail}> {row.detail}</span>}
                    </span>
                    <span>{row.value}</span>
                </li>
            ))}
            {/* Free places keep the board the same height, so the box never looks half empty. */}
            {Array.from({ length: Math.max(0, size - rows.length) }, (_, i) => (
                <li key={`free-${i}`} className={`${styles.boardRow} ${styles.boardFree}`} aria-hidden="true">
                    <span className={styles.boardRank}>{rows.length + i + 1}</span>
                    <span className={styles.boardName}>{FREE_PLACE}</span>
                </li>
            ))}
        </ol>
    );
}

/**
 * The rounds of a bracket side by side. The cards shrink with the number of rows, so a bigger round
 * still fits. `cardMax` is the biggest text size of a card, in pixels of the 1920 by 1080 drawing.
 * The round names grow with it. `dense` puts both players of a match on one line, so a round with
 * many matches keeps a readable size.
 */
export function BracketRounds({ rounds, rows, cardMax, dense = false }: { rounds: readonly ScreenRound[]; rows: number; cardMax?: number; dense?: boolean }) {
    const style = { '--rows': rows, '--cols': Math.max(rounds.length, 1), ...(cardMax ? { '--card-max': cardMax, '--round-name': Math.round(cardMax * 0.9) } : {}) } as CSSProperties;
    return (
        <div className={dense ? `${styles.bracketBody} ${styles.bracketDense}` : styles.bracketBody} style={style}>
            {rounds.map((round) => (
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
    );
}

/** One sponsor logo on a cream tile. A copy for the moving strip has no alt text. */
export function SponsorLogo({ sponsor, copy = false, className = styles.sponsor }: { sponsor: ScreenSponsor; copy?: boolean; className?: string }) {
    return (
        <li className={className}>
            {/* The logo is served as it was stored. The image optimizer of Next is not used. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sponsor.src} alt={copy ? '' : sponsor.name} width={sponsor.width} height={sponsor.height} />
        </li>
    );
}
