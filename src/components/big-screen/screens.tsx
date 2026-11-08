// The screens that take turns with the overview on the big screen. Each one fills the screen above
// the sponsor strip and is drawn for 1920 by 1080, like the overview.
import type { CSSProperties, ReactNode } from 'react';
import { Pizza } from '@/components/pizza/Pizza';
import { signed } from '@/components/stats/format';
import type { ScreenType } from '@/lib/big-screen/screens';
import { FOZA_ROWS, FOZA_WINS, type BigScreenData } from '@/lib/big-screen/view';
import { SponsorTile } from '@/components/sponsors/SponsorTile';
import { BoardPanel, BracketPanel, RankRows, ScreenTop } from './parts';
import { useSite } from './site';
import {
    correctLine,
    FOZA_TEXT,
    joinChip,
    livePoints,
    matchOdds,
    matchPill,
    nextCaption,
    NO_BRACKET,
    NO_FACTS,
    NO_MATCH,
    NO_SPONSORS,
    placeName,
    SCREEN_LABELS,
    SIDE_NAMES,
    SPONSOR_LABEL,
    WINNER_TEXT,
} from './text';
import styles from './big.module.css';
import own from './screens.module.css';

/**
 * The frame of a screen: the top line, then the screen under its title. The event code only shows
 * in the top line with the big screen key, since the store leaves it out otherwise.
 */
function Frame({ data, label, title, children }: { data: BigScreenData; label: string; title: string; children: ReactNode }) {
    const site = useSite();
    return (
        <div className={own.frame}>
            <ScreenTop name={data.eventName}>{data.eventCode !== null && <span className={styles.pill}>{joinChip(data.eventCode, site)}</span>}</ScreenTop>
            <section className={own.body} aria-label={label}>
                <h2 className={own.title}>{title}</h2>
                {children}
            </section>
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return (
        <div className={own.empty}>
            <Pizza size={160} />
            <p>{text}</p>
        </div>
    );
}

/** From this many matches in a round, both players of a match share one line. */
/** The whole bracket, every round. The sides of a double elimination bracket are stacked. */
export function BracketScreen({ data }: { data: BigScreenData }) {
    const bracket = data.fullBracket;
    return (
        <Frame data={data} label={SCREEN_LABELS.bracket} title={bracket ? `Kampoppsett · ${bracket.name}` : 'Kampoppsett'}>
            {!bracket ? (
                <Empty text={NO_BRACKET} />
            ) : (
                <div className={own.sides}>
                    {bracket.sections.map((section) => (
                        <BracketPanel
                            key={section.key}
                            head={bracket.sections.length > 1 ? SIDE_NAMES[section.key] : null}
                            rounds={section.rounds}
                            rows={section.rows}
                            cardMax={34}
                            dense={bracket.dense}
                            grow={section.rows}
                        />
                    ))}
                </div>
            )}
        </Frame>
    );
}

/** The bettors with the most Foza won, and the biggest single wins. */
export function FozaScreen({ data }: { data: BigScreenData }) {
    const { bettors, wins } = data.foza;
    return (
        <Frame data={data} label={SCREEN_LABELS.foza} title={SCREEN_LABELS.foza}>
            <div className={own.columns}>
                <BoardPanel label={FOZA_TEXT.net} title={FOZA_TEXT.net}>
                    {bettors.length === 0 ? (
                        <p className={styles.boardEmpty}>{FOZA_TEXT.empty}</p>
                    ) : (
                        <RankRows
                            rows={bettors.map((b, i) => ({ rank: i + 1, nickname: b.nickname, detail: correctLine(b.correct, b.bets), value: signed(b.net) }))}
                            size={FOZA_ROWS}
                            label={FOZA_TEXT.net}
                        />
                    )}
                </BoardPanel>
                <BoardPanel label={FOZA_TEXT.wins} title={FOZA_TEXT.wins}>
                    {wins.length === 0 ? (
                        <p className={styles.boardEmpty}>{FOZA_TEXT.noWins}</p>
                    ) : (
                        <RankRows rows={wins.map((w, i) => ({ rank: i + 1, nickname: w.nickname, detail: `på ${w.on}`, value: signed(w.profit) }))} size={FOZA_WINS} label={FOZA_TEXT.wins} />
                    )}
                </BoardPanel>
            </div>
        </Frame>
    );
}

/** The matches on the floor with their live score, then the next ones in play order. */
export function UpNextScreen({ data }: { data: BigScreenData }) {
    return (
        <Frame data={data} label={SCREEN_LABELS.next} title={SCREEN_LABELS.next}>
            {data.upNext.length === 0 ? (
                <Empty text={`${NO_MATCH.title}. ${NO_MATCH.text}`} />
            ) : (
                <ol className={own.next}>
                    {data.upNext.map((m) => {
                        const [a, b] = m.sides;
                        const live = m.state === 'started';
                        return (
                            <li key={m.matchId} className={`${own.nextRow} ${live ? own.nextLive : ''}`} aria-label={`${a.nickname} mot ${b.nickname}`}>
                                <span className={`${styles.tag} ${own.nextTag} ${live ? styles.tagLive : ''}`}>{matchPill(m).state}</span>
                                <span className={own.nextMain}>
                                    <span className={own.nextNames}>
                                        {a.nickname} <span className={styles.muted}>vs</span> {b.nickname}
                                    </span>
                                    <span className={styles.muted}>
                                        {m.label}
                                        {m.tournamentName ? ` · ${m.tournamentName}` : ''} · {nextCaption(m)}
                                    </span>
                                </span>
                                <span className={live ? own.nextScore : own.nextOdds}>{m.live ? livePoints(m.live) : live ? `${a.sets}–${b.sets}` : matchOdds(m)}</span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </Frame>
    );
}

/** The records of the event. Only those with something to show are in the data. */
export function StatsScreen({ data }: { data: BigScreenData }) {
    return (
        <Frame data={data} label={SCREEN_LABELS.stats} title={SCREEN_LABELS.stats}>
            {data.facts.length === 0 ? (
                <Empty text={NO_FACTS} />
            ) : (
                <ul className={own.facts} style={{ '--facts': Math.min(3, data.facts.length) } as CSSProperties}>
                    {data.facts.map((fact) => (
                        <li key={fact.key} className={`${styles.card} ${own.fact}`}>
                            <span className={own.factLabel}>{fact.label}</span>
                            <span className={own.factValue}>{fact.value}</span>
                            <span className={own.factWho}>{fact.who}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Frame>
    );
}

/** Columns for the sponsor grid, so the tiles stay as big as they can. */
export const sponsorColumns = (n: number) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : Math.ceil(Math.sqrt(n * 1.6)));

/** Every sponsor on its own big tile. */
export function SponsorScreen({ data }: { data: BigScreenData }) {
    const cols = sponsorColumns(data.sponsors.length);
    return (
        <Frame data={data} label={SCREEN_LABELS.sponsors} title={SPONSOR_LABEL}>
            {data.sponsors.length === 0 ? (
                <Empty text={NO_SPONSORS} />
            ) : (
                <ul className={own.showcase} style={{ '--cols': cols, '--rows': Math.ceil(data.sponsors.length / cols) } as CSSProperties}>
                    {data.sponsors.map((s) => (
                        <li key={s.id} className={own.showTile}>
                            <SponsorTile sponsor={s} />
                        </li>
                    ))}
                </ul>
            )}
        </Frame>
    );
}

/** The champion of a tournament, the final score and the rest of the podium. */
export function WinnerScreen({ data }: { data: BigScreenData }) {
    const winner = data.winner;
    if (!winner) return null;
    return (
        <Frame data={data} label={SCREEN_LABELS.winner} title={WINNER_TEXT.title}>
            <div className={own.winner}>
                <Pizza size={200} />
                <p className={styles.muted}>{WINNER_TEXT.of(winner.tournamentName)}</p>
                <p className={own.champion}>{winner.champion}</p>
                {winner.final && (
                    <p className={own.final}>
                        {winner.final.round}: {winner.final.sides[0].name} <strong>{winner.final.sides[0].score}–{winner.final.sides[1].score}</strong> {winner.final.sides[1].name}
                    </p>
                )}
                {winner.podium.length > 0 && (
                    <ul className={own.podium}>
                        {winner.podium.map((p) => (
                            <li key={p.place}>
                                <span className={own.place}>{placeName(p.place)}</span> {p.names.join(' og ')}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Frame>
    );
}

const SCREENS: Record<Exclude<ScreenType, 'overview'>, (props: { data: BigScreenData }) => ReactNode> = {
    bracket: BracketScreen,
    foza: FozaScreen,
    next: UpNextScreen,
    stats: StatsScreen,
    sponsors: SponsorScreen,
    winner: WinnerScreen,
};

/** Any screen but the overview, which the big screen draws itself. */
export function OtherScreen({ type, data }: { type: ScreenType; data: BigScreenData }) {
    if (type === 'overview') return null;
    const Screen = SCREENS[type];
    return <Screen data={data} />;
}
