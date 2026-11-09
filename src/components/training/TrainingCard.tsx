import p from '@/components/player/player.module.css';
import type { LiveTraining } from '@/lib/store/training';
import { TRAINING_TAG, TRAINING_TEXT, trainingSettings, trainingVersus } from './text';

/**
 * A training match in the list of what is in the ring. It is marked as training and has no pool,
 * no odds and no bet button, since nobody can bet on it.
 */
export function TrainingCard({ training }: { training: LiveTraining }) {
    const live = training.state === 'started';
    return (
        <article className={p.card} data-training={training.id}>
            <div className={p.cardTop}>
                <span className={p.tag}>{TRAINING_TAG}</span>
                <span className={`${p.tag} ${p.tagLive}`}>{live ? TRAINING_TEXT.live : TRAINING_TEXT.waiting}</span>
            </div>
            <h3 className={p.versus}>{trainingVersus(training.nickname, training.bot, training.difficulty)}</h3>
            <p className={p.meta}>{trainingSettings(training.ruleFile, training.scoreToWin)}</p>
        </article>
    );
}
