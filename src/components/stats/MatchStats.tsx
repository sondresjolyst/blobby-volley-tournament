import type { ReactNode } from 'react';
import type { GameStatsView, MatchStatTotals } from '@/lib/store/game-stats';
import { average, countOrDash, number, percent } from './format';
import { gameLines, type GameLines, type PlayerIds } from './match-view';
import { gameTitle, MATCH_TEXT, UNKNOWN_PLAYER } from './match-text';
import styles from './stats.module.css';

type Names = readonly [string | null, string | null];

const shown = (name: string | null) => name ?? UNKNOWN_PLAYER;

function PlayerCard({ label, names, values }: { label: string; names: Names; values: [string, string] }) {
    return (
        <div className={styles.statCard} role="group" aria-label={label}>
            <span className={styles.statLabel}>{label}</span>
            <div className={styles.statSides}>
                {values.map((value, i) => (
                    <div key={i} className={styles.statSide}>
                        <span className={styles.statValue}>{value}</span>
                        <span className={styles.statWho}>{shown(names[i])}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function GameCard({ label, value }: { label: string; value: string }) {
    return (
        <div className={styles.statCard} role="group" aria-label={label}>
            <span className={styles.statLabel}>{label}</span>
            <span className={styles.statValue}>{value}</span>
        </div>
    );
}

/** The cards of one game or of the whole match. The players come side by side and the ball games below. */
export function StatCards({ names, lines }: { names: Names; lines: GameLines }) {
    const [a, b] = lines.players;
    return (
        <div className={styles.cards}>
            <PlayerCard label={MATCH_TEXT.possession} names={names} values={[percent(a.possession), percent(b.possession)]} />
            <PlayerCard label={MATCH_TEXT.touches} names={names} values={[number(a.touches), number(b.touches)]} />
            <PlayerCard label={MATCH_TEXT.errors} names={names} values={[number(a.errors), number(b.errors)]} />
            <PlayerCard label={MATCH_TEXT.netHits} names={names} values={[number(a.netHits), number(b.netHits)]} />
            <GameCard label={MATCH_TEXT.rallies} value={number(lines.rallies)} />
            <GameCard label={MATCH_TEXT.longestRally} value={countOrDash(lines.longestRally)} />
            <GameCard label={MATCH_TEXT.averageRally} value={average(lines.averageRally)} />
        </div>
    );
}

/** A game with its score on one line, and its cards or the note that it has no stats. */
export function GameBlock({ title, score, names, lines, empty = MATCH_TEXT.noStats, tag }: { title: string; score: [number, number] | null; names: Names; lines: GameLines | null; empty?: string; tag?: ReactNode }) {
    return (
        <section className={styles.gameBlock} aria-label={title}>
            <h3 className={styles.gameHead}>
                <span>{title}</span>
                {score && (
                    <span className={styles.gameScore}>
                        {score[0]}–{score[1]}
                    </span>
                )}
                {tag}
            </h3>
            {lines ? <StatCards names={names} lines={lines} /> : <p className={styles.empty}>{empty}</p>}
        </section>
    );
}

function totalLines(totals: MatchStatTotals): GameLines {
    return { players: totals.players, rallies: totals.rallies, longestRally: totals.longestRally, averageRally: totals.averageRally };
}

/** The whole match first with its series score, then the finished games. A game without stats shows only the score. A walkover has no games and shows a note. */
export function FinishedGames({ names, ids, games, totals, score = null, walkover = false }: { names: Names; ids: PlayerIds; games: GameStatsView[]; totals: MatchStatTotals; score?: [number, number] | null; walkover?: boolean }) {
    if (walkover) return <p className={styles.empty}>{MATCH_TEXT.walkoverNote}</p>;
    if (games.length === 0) return <p className={styles.empty}>{MATCH_TEXT.noGames}</p>;
    return (
        <>
            {totals.games > 0 && <GameBlock title={MATCH_TEXT.whole} score={score} names={names} lines={totalLines(totals)} />}
            {games.map((g) => (
                <GameBlock key={g.game} title={gameTitle(g.game)} score={g.points} names={names} lines={gameLines(g.stats, ids)} />
            ))}
        </>
    );
}
