import Link from 'next/link';
import { LiveRefresh } from '@/components/LiveRefresh';
import { BracketBoard } from '@/components/player/BracketBoard';
import { NO_BRACKET } from '@/components/big-screen/text';
import { Pizza } from '@/components/pizza/Pizza';
import { PlayerShell } from '@/components/player/PlayerShell';
import styles from '@/components/player/player.module.css';
import type { FormatId, SeedingMethod } from '@/lib/bracket';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { nicknameOf } from '@/lib/stats/players';
import { requireActivePlayer } from '@/lib/players/current';
import { listMatchPools } from '@/lib/store/bets';
import { getBalance } from '@/lib/store/foza';
import { liveStamp } from '@/lib/store/live';
import { getPlacings, listMatches } from '@/lib/store/matches';
import { getTournament, listTournaments } from '@/lib/store/tournaments';
import { buildBoard } from '@/lib/tournaments/board';

const FORMAT_NAMES: Record<FormatId, string> = { single_elimination: 'enkel utslag', double_elimination: 'dobbel utslag' };
const SEEDING_NAMES: Record<SeedingMethod, string> = { random: 'tilfeldig oppsett', manual: 'handplukka oppsett', elo: 'oppsett etter Elo' };

export default async function BracketPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
    const player = await requireActivePlayer();
    const pool = getPool();
    // The stamp is read before the data, so a change that commits during the reads loads the page once more.
    const stamp = await liveStamp(pool, player.eventId);
    const balance = (await getBalance(pool, player.id, new Date())) ?? player.fozaBalance;
    const tournaments = await listTournaments(pool, player.eventId);
    const { t } = await searchParams;
    const wanted = typeof t === 'string' ? parseId(t) : null;
    // Only a tournament of the player's own event is shown. Any other id falls back to the newest.
    const chosen = tournaments.find((x) => x.id === wanted) ?? tournaments[0];
    const shell = { page: 'bracket' as const, eventName: player.eventName, nickname: player.nickname, balance };
    if (!chosen) {
        return (
            <PlayerShell {...shell}>
                {stamp !== null && <LiveRefresh eventId={player.eventId} stamp={stamp} />}
                <div className={styles.wide}>
                    <h1 className={styles.h1}>Kampoppsett</h1>
                    <p className={styles.empty}>{NO_BRACKET}</p>
                </div>
            </PlayerShell>
        );
    }

    const [tournament, matches, pools, placings] = await Promise.all([getTournament(pool, chosen.id), listMatches(pool, player.eventId), listMatchPools(pool, player.eventId), getPlacings(pool, chosen.id)]);
    const own = matches.filter((m) => m.tournamentId === chosen.id);
    const open = new Set(pools.filter((p) => p.open).map((p) => p.matchId));
    const sections = tournament ? buildBoard(tournament.format, tournament.matches, own, player.id, open) : [];
    const nickname = nicknameOf(new Map(tournament?.players.map((p) => [p.playerId, p.nickname])));
    const champion = placings.find((p) => p.place === 1);
    return (
        <PlayerShell {...shell}>
            {stamp !== null && <LiveRefresh eventId={player.eventId} stamp={stamp} />}
            <div className={styles.wide}>
                <div className={styles.banner}>
                    <Pizza size={140} variant="taco" className={styles.bannerPizza} />
                    <div className={styles.bannerText}>
                        <h1 className={styles.h1}>{chosen.name}</h1>
                        {tournament && (
                            <p className={styles.bannerSub}>
                                {tournament.players.length} spelara · {FORMAT_NAMES[tournament.format]} · {SEEDING_NAMES[tournament.seeding]} · først te {tournament.scoreToWin} · {tournament.speed} fps
                            </p>
                        )}
                    </div>
                    {tournaments.length > 1 && (
                        <nav aria-label="Turneringa" className={styles.tabs}>
                            {tournaments.map((x) => (
                                <Link key={x.id} href={`/bracket?t=${x.id}`} className={styles.tab} aria-current={x.id === chosen.id ? 'page' : undefined}>
                                    {x.name}
                                </Link>
                            ))}
                        </nav>
                    )}
                </div>

                {sections.map((section) => (
                    <section key={section.key} className={styles.section} aria-labelledby={`side-${section.key}`}>
                        <h2 id={`side-${section.key}`} className={sections.length > 1 ? styles.h2 : styles.srOnly}>
                            {section.key === 'losers' ? 'Tapersida' : sections.length > 1 ? 'Vinnarsida' : 'Kampane'}
                        </h2>
                        <BracketBoard rounds={section.rounds} champion={section.key === 'main' ? { name: champion ? nickname(champion.playerId) : null } : undefined} />
                    </section>
                ))}

                {placings.length > 0 && (
                    <section className={styles.section} aria-labelledby="plasseringa">
                        <h2 id="plasseringa" className={styles.h2}>
                            Plasseringa så langt
                        </h2>
                        <ul className={styles.list} aria-label="Plasseringa">
                            {placings.map((p) => (
                                <li key={p.playerId}>
                                    <strong>{p.place}.</strong> {nickname(p.playerId)}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </PlayerShell>
    );
}
