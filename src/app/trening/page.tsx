import { connection } from 'next/server';
import { InfoLabel } from '@/components/InfoButton';
import { CopyJoinLink } from '@/components/player/CopyJoinLink';
import { RulesFields } from '@/components/player/RulesFields';
import { PlayerShell } from '@/components/player/PlayerShell';
import p from '@/components/player/player.module.css';
import { LiveRefresh } from '@/components/LiveRefresh';
import { SiteShell } from '@/components/site/SiteShell';
import { TRAINING_TAG, TRAINING_TEXT, trainingErrorMessage, trainingNoticeMessage, trainingSettings, trainingVersus } from '@/components/training/text';
import { OwnTrainingStats, TrainingOverviewSection } from '@/components/training/TrainingStats';
import { getPool } from '@/lib/db';
import { getActivePlayer } from '@/lib/players/current';
import { joinLink } from '@/lib/players/join-code';
import { getActiveEvent } from '@/lib/store/events';
import { liveStamp } from '@/lib/store/live';
import { getJoinCode } from '@/lib/store/players';
import { getOpenTraining, getPlayerTrainingStats, getTrainingOverview } from '@/lib/store/training';
import { DEFAULT_BOT, DEFAULT_DIFFICULTY, MAX_DIFFICULTY, MIN_DIFFICULTY, TRAINING_BOTS } from '@/lib/training/settings';
import { NO_LAN } from '@/lib/texts';

type Search = { training?: string | string[]; trainingError?: string | string[] };

/**
 * Training against the bot of the game server. A signed in player starts a training match here
 * and sees their own training stats. Everyone sees the training overview of the event. Training
 * never counts for Foza, bets, the leaderboards or the tournaments.
 */
export default async function Training({ searchParams }: { searchParams: Promise<Search> }) {
    await connection();
    const pool = getPool();
    const event = await getActiveEvent(pool);
    const player = event ? await getActivePlayer() : null;
    const me = player && player.eventId === event?.id ? player : null;

    if (!event) {
        return (
            <SiteShell eventName={null} player={null} current="/trening">
                <div className={p.column}>
                    <h1 className={p.h1}>{TRAINING_TEXT.title}</h1>
                    <p className={p.muted}>{NO_LAN}</p>
                </div>
            </SiteShell>
        );
    }

    const stamp = await liveStamp(pool, event.id);
    const overview = await getTrainingOverview(pool, event.id);
    const overviewSection = <TrainingOverviewSection overview={overview} />;

    if (!me) {
        return (
            <SiteShell eventName={event.name} player={null} current="/trening">
                {stamp !== null && <LiveRefresh eventId={event.id} stamp={stamp} />}
                <div className={p.column}>
                    <h1 className={p.h1}>{TRAINING_TEXT.title}</h1>
                    <p className={p.muted}>{TRAINING_TEXT.intro}</p>
                    {overviewSection}
                </div>
            </SiteShell>
        );
    }

    const [open, stats] = await Promise.all([getOpenTraining(pool, me.id), getPlayerTrainingStats(pool, me.id)]);
    const details = event;
    // The join code is secret, so it is read only when the player has a training to join.
    const code = open && details?.serverHost && details.serverPort ? await getJoinCode(pool, me.id) : null;
    const join = code && details?.serverHost && details.serverPort ? joinLink(details.serverHost, details.serverPort, code) : null;
    const search = await searchParams;
    const error = trainingErrorMessage(search.trainingError);
    const notice = trainingNoticeMessage(search.training);

    return (
        <PlayerShell page="training" eventName={me.eventName} nickname={me.nickname} balance={me.fozaBalance}>
            {stamp !== null && <LiveRefresh eventId={event.id} stamp={stamp} />}
            <div className={p.column}>
                <h1 className={p.h1}>{TRAINING_TEXT.title}</h1>
                <p className={p.muted}>{TRAINING_TEXT.intro}</p>
                {error && (
                    <p role="alert" className={p.alert}>
                        {error}
                    </p>
                )}
                {notice && (
                    <p role="status" className={p.notice}>
                        {notice}
                    </p>
                )}

                {open && (
                    <section className={p.hero} aria-labelledby="treninga-di">
                        <p className={p.kicker}>
                            {TRAINING_TAG} · {trainingSettings(open.ruleFile, open.scoreToWin)}
                        </p>
                        <h2 id="treninga-di" className={p.heroTitle}>
                            {open.state === 'started' ? TRAINING_TEXT.running : TRAINING_TEXT.ready}
                        </h2>
                        <p className={p.heroVersus}>{trainingVersus(me.nickname, open.bot, open.difficulty)}</p>
                        {join && code && details?.serverHost && details.serverPort ? (
                            <>
                                <CopyJoinLink link={join} />
                                <p className={p.heroNote}>{TRAINING_TEXT.joinNote}</p>
                                <dl className={p.joinFacts}>
                                    <div>
                                        <dt>Server</dt>
                                        <dd>
                                            {details.serverHost}:{details.serverPort}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>Kode</dt>
                                        <dd>{code}</dd>
                                    </div>
                                </dl>
                            </>
                        ) : (
                            <p className={p.heroNote}>{TRAINING_TEXT.serverNotReady}</p>
                        )}
                        <form method="post" action={`/api/player/training/${open.id}`}>
                            <button type="submit" className={p.buttonQuiet}>
                                {TRAINING_TEXT.stop}
                            </button>
                        </form>
                    </section>
                )}

                <OwnTrainingStats stats={stats} headingId="mine-treninga" />
                {overviewSection}
            </div>

            <aside className={p.aside}>
                <section id="tren" className={p.panel} aria-labelledby="tren-tittel">
                    <h2 id="tren-tittel" className={p.h2}>
                        {TRAINING_TEXT.title}
                    </h2>
                    <form method="post" action="/api/player/training" className={p.challengeForm}>
                        <label className={p.field}>
                            {TRAINING_TEXT.bot}
                            <select name="bot" className={p.input} defaultValue={DEFAULT_BOT}>
                                {TRAINING_BOTS.map((bot) => (
                                    <option key={bot} value={bot}>
                                        {bot}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <RulesFields>
                            <div className={p.field}>
                                <InfoLabel htmlFor="difficulty" text={TRAINING_TEXT.difficulty} info={TRAINING_TEXT.difficultyInfo}>
                                    <p>{TRAINING_TEXT.difficultyInfoText}</p>
                                </InfoLabel>
                                <input id="difficulty" name="difficulty" type="number" className={p.input} min={MIN_DIFFICULTY} max={MAX_DIFFICULTY} step={1} defaultValue={DEFAULT_DIFFICULTY} required aria-describedby="difficulty-hint difficulty-help" />
                                <span id="difficulty-hint" className={p.hint}>
                                    {TRAINING_TEXT.difficultyHint}
                                </span>
                            </div>
                        </RulesFields>
                        <button type="submit" className={p.button} disabled={open !== null}>
                            {TRAINING_TEXT.start}
                        </button>
                    </form>
                </section>
            </aside>
        </PlayerShell>
    );
}
