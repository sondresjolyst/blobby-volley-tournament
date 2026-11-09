'use client';

import { useState, type ReactNode } from 'react';
import { InfoLabel } from '@/components/InfoButton';
import { DEFAULT_RULES } from '@/lib/bracket';
import { fixedScoreToWin, GAME_RULES, MAX_REAL_SCORE_TO_WIN, realScoreToWin } from '@/lib/matches/rules';
import { DEFAULT_SCORE_TO_WIN, MAX_SCORE_TO_WIN, MIN_SCORE_TO_WIN } from '@/lib/matches/settings';
import { FIELD_INFO } from './info';
import { pointsHint } from './text';
import styles from './player.module.css';

/**
 * The rules and points fields of the 1v1 form. Lyn always plays to 2, so the points field is locked
 * and left out of the form. Brannmur plays to 10 times the points, and the hint says so. The speed
 * field goes next to the points.
 */
export function RulesFields({ children }: { children: ReactNode }) {
    const [ruleFile, setRuleFile] = useState(DEFAULT_RULES);
    const [points, setPoints] = useState(String(DEFAULT_SCORE_TO_WIN));
    const locked = fixedScoreToWin(ruleFile);
    const max = ruleFile === 'firewall.lua' ? MAX_REAL_SCORE_TO_WIN / 10 : MAX_SCORE_TO_WIN;
    const chosen = Number(points);
    return (
        <>
            <div className={styles.field}>
                <InfoLabel htmlFor="ruleFile" text="Regla" info={FIELD_INFO.ruleFile.label}>
                    <p>{FIELD_INFO.ruleFile.text}</p>
                    <ul className={styles.rulesList}>
                        {GAME_RULES.map((r) => (
                            <li key={r.file}>
                                <strong>{r.name}:</strong> {r.description}
                            </li>
                        ))}
                    </ul>
                </InfoLabel>
                <select id="ruleFile" name="ruleFile" aria-describedby="ruleFile-help" className={styles.input} value={ruleFile} onChange={(e) => setRuleFile(e.target.value)}>
                    {GAME_RULES.map((r) => (
                        <option key={r.file} value={r.file}>
                            {r.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className={styles.fieldRow}>
                <div className={styles.field}>
                    <InfoLabel htmlFor="scoreToWin" text="Først te" info={FIELD_INFO.scoreToWin.label}>
                        <p>{FIELD_INFO.scoreToWin.text}</p>
                    </InfoLabel>
                    <input
                        id="scoreToWin"
                        name={locked ? undefined : 'scoreToWin'}
                        type="number"
                        className={styles.input}
                        min={MIN_SCORE_TO_WIN}
                        max={max}
                        step={1}
                        value={locked ? String(realScoreToWin(ruleFile, chosen)) : points}
                        onChange={(e) => setPoints(e.target.value)}
                        disabled={locked}
                        required
                        aria-describedby="scoreToWin-hint scoreToWin-help"
                    />
                    <span id="scoreToWin-hint" className={styles.hint}>
                        {pointsHint(ruleFile, Number.isInteger(chosen) ? chosen : DEFAULT_SCORE_TO_WIN)}
                    </span>
                </div>
                {children}
            </div>
        </>
    );
}
