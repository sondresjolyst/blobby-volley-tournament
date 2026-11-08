import Link from 'next/link';
import type { BoardMatch, BoardRound, BoardSlot } from '@/lib/tournaments/board';
import styles from './player.module.css';

function SlotRow({ slot }: { slot: BoardSlot }) {
    const classes = [styles.slot, slot.outcome === 'won' && styles.slotWon, slot.outcome === 'lost' && styles.slotLost, slot.playerId === null && styles.slotEmpty, slot.mine && styles.slotMine];
    return (
        <div className={classes.filter(Boolean).join(' ')}>
            <span>{slot.name}</span>
            <span>{slot.score ?? ''}</span>
        </div>
    );
}

function BoardCard({ match }: { match: BoardMatch }) {
    const classes = [styles.boardCard, match.state === 'started' && styles.live, match.mine && styles.mine];
    return (
        <article className={classes.filter(Boolean).join(' ')} aria-label={`Kamp ${match.number}: ${match.slots[0].name} mot ${match.slots[1].name}, ${match.status}`}>
            <div className={styles.boardCardTop}>
                <span>Kamp {match.number}</span>
                <span className={`${styles.tag} ${match.state === 'started' ? styles.tagLive : ''}`}>{match.status}</span>
            </div>
            <SlotRow slot={match.slots[0]} />
            <SlotRow slot={match.slots[1]} />
            {match.openForBets && (
                <Link href={`/me#kamp-${match.matchId}`} className={styles.betLink}>
                    Sats nå
                </Link>
            )}
        </article>
    );
}

/** The rounds of one part of a bracket side by side. Wide brackets scroll sideways. */
export function BracketBoard({ rounds, champion }: { rounds: BoardRound[]; champion?: { name: string | null } }) {
    return (
        <div className={styles.boardScroll}>
            <div className={styles.board}>
                {rounds.map((round) => (
                    <section key={round.key} className={styles.round} aria-label={round.name}>
                        <div className={styles.roundHead}>
                            <h3 className={styles.roundName}>{round.name}</h3>
                            <span className={styles.roundBestOf}>Best av {round.bestOf}</span>
                        </div>
                        <div className={styles.roundMatches}>
                            {round.matches.map((match) => (
                                <BoardCard key={match.matchId} match={match} />
                            ))}
                        </div>
                    </section>
                ))}
                {champion && (
                    <section className={styles.round} aria-label="Mester">
                        <div className={`${styles.roundHead} ${styles.roundHeadGold}`}>
                            <h3 className={styles.roundName}>Mester</h3>
                        </div>
                        <div className={styles.roundMatches}>
                            <div className={styles.champion}>
                                <svg width="88" height="88" viewBox="0 0 64 64" aria-hidden="true">
                                    <path d="M18 8 H46 V22 A14 14 0 0 1 18 22 Z" fill="#F6C445" stroke="#8A4B1E" strokeWidth="3" />
                                    <path d="M18 12 H8 V18 A10 10 0 0 0 18 26 M46 12 H56 V18 A10 10 0 0 1 46 26" fill="none" stroke="#F6C445" strokeWidth="4" />
                                    <rect x="28" y="36" width="8" height="10" fill="#F6C445" />
                                    <rect x="20" y="46" width="24" height="8" rx="2" fill="#C8321F" />
                                    <circle cx="32" cy="18" r="5" fill="#C8321F" />
                                </svg>
                                <span className={styles.championName}>{champion.name ?? 'Kem vinne?'}</span>
                                <span>{champion.name ? 'Tar med seg pokalen heim' : 'Vinnaren får pokal og ære'}</span>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
