import p from '@/components/player/player.module.css';
import t from './training.module.css';
import type { PlayerTrainingStats, TrainingOverview } from '@/lib/store/training';
import { hardestBeatenLine, TRAINING_TEXT, trainingCounts } from './text';

/** The training stats of one player: the totals, the hardest bot beaten and a row per bot and difficulty. */
export function OwnTrainingStats({ stats, headingId }: { stats: PlayerTrainingStats; headingId: string }) {
    return (
        <section className={p.section} aria-labelledby={headingId}>
            <h2 id={headingId} className={p.h2}>
                {TRAINING_TEXT.ownTitle}
            </h2>
            {stats.games === 0 ? (
                <p className={p.muted}>{TRAINING_TEXT.ownEmpty}</p>
            ) : (
                <>
                    <p className={p.meta}>{trainingCounts(stats.games, stats.wins, stats.losses)}</p>
                    <p className={p.meta}>{stats.hardestBeaten ? hardestBeatenLine(stats.hardestBeaten.bot, stats.hardestBeaten.difficulty) : TRAINING_TEXT.noneBeaten}</p>
                    <div className={p.tableWrap}>
                        <table className={p.table}>
                            <thead>
                                <tr>
                                    <th>{TRAINING_TEXT.bot}</th>
                                    <th>{TRAINING_TEXT.difficulty}</th>
                                    <th>{TRAINING_TEXT.games}</th>
                                    <th>{TRAINING_TEXT.wins}</th>
                                    <th>{TRAINING_TEXT.losses}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.records.map((r) => (
                                    <tr key={`${r.bot}-${r.difficulty}`}>
                                        <td>{r.bot}</td>
                                        <td>{r.difficulty}</td>
                                        <td>{r.games}</td>
                                        <td>{r.wins}</td>
                                        <td>{r.losses}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}

/** The public training overview of an event: who trains the most, the most played bots and the wins per bot and difficulty. */
export function TrainingOverviewSection({ overview }: { overview: TrainingOverview }) {
    return (
        <section className={p.section} aria-labelledby="treningstoppen">
            <h2 id="treningstoppen" className={p.h2}>
                {TRAINING_TEXT.overviewTitle}
            </h2>
            {overview.trainers.length === 0 ? (
                <p className={p.muted}>{TRAINING_TEXT.overviewEmpty}</p>
            ) : (
                <>
                    <h3 className={t.h3}>{TRAINING_TEXT.trainers}</h3>
                    <div className={p.tableWrap}>
                        <table className={p.table} aria-label={TRAINING_TEXT.trainers}>
                            <thead>
                                <tr>
                                    <th>{TRAINING_TEXT.player}</th>
                                    <th>{TRAINING_TEXT.games}</th>
                                    <th>{TRAINING_TEXT.wins}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {overview.trainers.map((t) => (
                                    <tr key={t.playerId}>
                                        <td>{t.nickname}</td>
                                        <td>{t.games}</td>
                                        <td>{t.wins}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <h3 className={t.h3}>{TRAINING_TEXT.bots}</h3>
                    <div className={p.tableWrap}>
                        <table className={p.table} aria-label={TRAINING_TEXT.bots}>
                            <thead>
                                <tr>
                                    <th>{TRAINING_TEXT.bot}</th>
                                    <th>{TRAINING_TEXT.games}</th>
                                    <th>{TRAINING_TEXT.playerWins}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {overview.bots.map((b) => (
                                    <tr key={b.bot}>
                                        <td>{b.bot}</td>
                                        <td>{b.games}</td>
                                        <td>{b.playerWins}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <h3 className={t.h3}>{TRAINING_TEXT.perDifficulty}</h3>
                    <div className={p.tableWrap}>
                        <table className={p.table} aria-label={TRAINING_TEXT.perDifficulty}>
                            <thead>
                                <tr>
                                    <th>{TRAINING_TEXT.bot}</th>
                                    <th>{TRAINING_TEXT.difficulty}</th>
                                    <th>{TRAINING_TEXT.games}</th>
                                    <th>{TRAINING_TEXT.playerWins}</th>
                                    <th>{TRAINING_TEXT.botWins}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {overview.records.map((r) => (
                                    <tr key={`${r.bot}-${r.difficulty}`}>
                                        <td>{r.bot}</td>
                                        <td>{r.difficulty}</td>
                                        <td>{r.games}</td>
                                        <td>{r.wins}</td>
                                        <td>{r.losses}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}
