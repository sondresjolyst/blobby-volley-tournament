import Link from 'next/link';
import type { GameListRow } from '@/lib/store/game-list';
import { rulesName } from '@/lib/matches/rules';
import { RESULT_TEXT, gameNames, gameScore, kindTag, seeGameLabel } from './game-list-text';
import styles from './stats.module.css';

/** The games as rows with names, score, tags and a link to the match page. Used by Resultat and the profile. */
export function GameList({ games, label = RESULT_TEXT.list }: { games: GameListRow[]; label?: string }) {
    return (
        <ul className={styles.games} aria-label={label}>
            {games.map((g) => (
                <li key={g.id} className={`${styles.game} ${g.running ? styles.gameRunning : ''}`}>
                    <span className={styles.gameNames}>{gameNames(g)}</span>
                    <span className={styles.resultScore}>{gameScore(g)}</span>
                    <span className={styles.gameInfo}>
                        <span className={styles.badge}>{kindTag(g.kind)}</span>
                        {g.running && <span className={`${styles.badge} ${styles.liveTag}`}>{RESULT_TEXT.live}</span>}
                        <span>{rulesName(g.ruleFile)}</span>
                    </span>
                    <Link href={`/kamp/${g.id}`} aria-label={seeGameLabel(g.names)}>
                        {RESULT_TEXT.see}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
