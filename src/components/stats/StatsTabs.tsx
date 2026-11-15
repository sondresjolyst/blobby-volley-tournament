'use client';

import { useState } from 'react';
import type { StatsScope, StatTotals } from '@/lib/store/game-stats';
import { average, countOrDash, number, percent } from './format';
import { MATCH_TEXT } from './match-text';
import { PROFILE_TEXT, SCOPE_LABELS } from './profile-text';
import styles from './stats.module.css';

const SCOPES: StatsScope[] = ['matches', 'training', 'all'];

function Card({ label, value }: { label: string; value: string }) {
    return (
        <div className={styles.statCard} role="group" aria-label={label}>
            <span className={styles.statLabel}>{label}</span>
            <span className={styles.statValue}>{value}</span>
        </div>
    );
}

/** The stat cards of a player with a tab for matches, training and both. All the numbers come as props, so a switch needs no request. */
export function StatsTabs({ totals }: { totals: Record<StatsScope, StatTotals> }) {
    const [scope, setScope] = useState<StatsScope>('matches');
    const shown = totals[scope];
    return (
        <div>
            <div className={styles.scopeTabs}>
                {SCOPES.map((s) => (
                    <button key={s} type="button" className={styles.scopeTab} aria-pressed={scope === s} onClick={() => setScope(s)}>
                        {SCOPE_LABELS[s]}
                    </button>
                ))}
            </div>
            {shown.games === 0 ? (
                <p className={styles.empty}>{PROFILE_TEXT.noStats[scope]}</p>
            ) : (
                <div className={styles.cards}>
                    <Card label={MATCH_TEXT.possession} value={percent(shown.possession)} />
                    <Card label={PROFILE_TEXT.touchesPerGame} value={average(shown.touchesPerGame)} />
                    <Card label={PROFILE_TEXT.errorsPerGame} value={average(shown.errorsPerGame)} />
                    <Card label={MATCH_TEXT.netHits} value={number(shown.netHits)} />
                    <Card label={MATCH_TEXT.longestRally} value={countOrDash(shown.longestRally)} />
                    <Card label={MATCH_TEXT.averageRally} value={average(shown.averageRally)} />
                    <Card label={PROFILE_TEXT.games} value={number(shown.games)} />
                </div>
            )}
        </div>
    );
}
