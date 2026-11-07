import { AdminShell } from '@/components/admin/AdminShell';
import { BracketView } from '@/components/tournaments/BracketView';
import { requireAdmin } from '@/lib/auth/options';
import { BEST_OF, FORMATS, type PlannedBracket } from '@/lib/bracket';
import { getPool } from '@/lib/db';
import { getActiveEvent } from '@/lib/store/events';
import { listPlayers } from '@/lib/store/players';
import { eloRatings } from '@/lib/store/stats';
import { ELO_START, shownRating } from '@/lib/stats/elo';
import {
    bestOfField,
    fieldsOf,
    newRandomSeed,
    parseTournamentDraft,
    planTournament,
    roundsSignature,
    rulesField,
    seedField,
    SEEDING_LABELS,
    toSearchParams,
    tournamentErrorMessage,
    type TournamentDraft,
} from '@/lib/tournaments/input';
import { describeBracket } from '@/lib/tournaments/view';

type Search = Record<string, string | string[] | undefined>;

/**
 * Builds a tournament in the active event. The form is sent to this page with GET to show a
 * preview, and posted to the admin API to save. The same random seed gives the same bracket.
 */
export default async function NewTournament({ searchParams }: { searchParams: Promise<Search> }) {
    await requireAdmin();
    const pool = getPool();
    const event = await getActiveEvent(pool);
    if (!event) {
        return (
            <AdminShell section="tournaments">
                <h1>New tournament</h1>
                <p>There is no active event. Set an event active first.</p>
            </AdminShell>
        );
    }
    const [players, ratings] = await Promise.all([listPlayers(pool, event.id), eloRatings(pool, event.id)]);
    const params = toSearchParams(await searchParams);
    const read = fieldsOf(params);
    const value = (name: string) => read(name)[0] ?? '';
    const chosen = new Set(read('player'));

    let message = tournamentErrorMessage(value('error') || undefined);
    let draft: TournamentDraft | null = null;
    let plan: PlannedBracket | null = null;
    if (params.has('name')) {
        const parsed = parseTournamentDraft(read);
        if (!parsed.ok) message ??= tournamentErrorMessage(parsed.error);
        else if (!parsed.value.playerIds.every((id) => players.some((p) => p.id === id))) message ??= tournamentErrorMessage('players');
        else {
            draft = parsed.value;
            plan = planTournament(draft, ratings);
        }
    }
    const randomSeed = value('randomSeed') || String(newRandomSeed());
    const nickname = new Map(players.map((p) => [p.id, p.nickname]));

    return (
        <AdminShell section="tournaments">
            <h1>New tournament</h1>
            <p>Event: {event.name}</p>
            {message && <p role="alert">{message}</p>}
            <form method="get" action="/admin/tournaments/new">
                <p>
                    <label>
                        Name <input name="name" required maxLength={100} defaultValue={value('name')} />
                    </label>
                </p>
                <p>
                    <label>
                        Format{' '}
                        <select name="format" defaultValue={value('format') || 'single_elimination'}>
                            {Object.values(FORMATS).map((format) => (
                                <option key={format.id} value={format.id}>
                                    {format.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </p>
                <p>
                    <label>
                        <input type="checkbox" name="thirdPlace" value="1" defaultChecked={value('thirdPlace') !== ''} /> Third place match (single elimination only)
                    </label>
                </p>
                <p>Without a third place match, both semifinal losers share 3rd place.</p>
                <p>
                    <label>
                        Seeding{' '}
                        <select name="seeding" defaultValue={value('seeding') || 'random'}>
                            {Object.entries(SEEDING_LABELS).map(([id, label]) => (
                                <option key={id} value={id}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                </p>
                <p>
                    <label>
                        Random seed <input name="randomSeed" inputMode="numeric" pattern="[0-9]{1,10}" required defaultValue={randomSeed} />
                    </label>
                </p>
                <p>
                    <label>
                        Points to win a game <input name="scoreToWin" type="number" min={1} max={99} step={1} required defaultValue={value('scoreToWin') || '15'} />
                    </label>
                </p>
                <p>
                    <label>
                        Game speed in frames per second <input name="speed" type="number" min={30} max={120} step={1} required defaultValue={value('speed') || '75'} />
                    </label>
                </p>
                <p>75 frames per second is the normal speed of the game.</p>
                <p>Seeding by Elo rating puts the highest rating first. It uses the ratings when you save, so a match that ends after the preview can change the seeds. Equal ratings go in the order the players signed up in.</p>

                <fieldset>
                    <legend>Players</legend>
                    {players.length === 0 ? (
                        <p>No players in this event yet.</p>
                    ) : (
                        <div className="admin-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Play</th>
                                        <th>Seed when seeding by hand</th>
                                        <th>Elo rating</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {players.map((player) => (
                                        <tr key={player.id}>
                                            <td>
                                                <label>
                                                    <input type="checkbox" name="player" value={player.id} defaultChecked={chosen.has(String(player.id))} /> {player.nickname}
                                                </label>
                                            </td>
                                            <td>
                                                <label>
                                                    Seed for {player.nickname}{' '}
                                                    <input name={seedField(player.id)} inputMode="numeric" size={3} defaultValue={value(seedField(player.id))} />
                                                </label>
                                            </td>
                                            <td>{shownRating(ratings.get(player.id) ?? ELO_START)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </fieldset>

                {plan && (
                    <fieldset>
                        <legend>Rounds</legend>
                        <input type="hidden" name="roundsFor" value={roundsSignature(plan)} />
                        <div className="admin-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Round</th>
                                        <th>Best of</th>
                                        <th>Rules</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {plan.rounds.map((round) => (
                                        <tr key={round.key}>
                                            <td>{round.name}</td>
                                            <td>
                                                <label>
                                                    Best of for {round.name}{' '}
                                                    <select name={bestOfField(round.key)} defaultValue={String(round.bestOf)}>
                                                        {BEST_OF.map((n) => (
                                                            <option key={n} value={n}>
                                                                {n}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </td>
                                            <td>
                                                <label>
                                                    Rules for {round.name} <input name={rulesField(round.key)} maxLength={64} defaultValue={round.ruleFile} />
                                                </label>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </fieldset>
                )}

                <p>
                    <button type="submit">Preview</button>{' '}
                    {plan && (
                        <button type="submit" formMethod="post" formAction="/api/admin/tournaments">
                            Save tournament
                        </button>
                    )}
                </p>
            </form>

            {plan && draft && (
                <>
                    <h2>Preview</h2>
                    <p>After a change, press Preview again to see the bracket that Save stores.</p>
                    <h3>Seeds</h3>
                    <ol>
                        {plan.seeds.map((id) => (
                            <li key={id}>{nickname.get(id) ?? `Player ${id}`}</li>
                        ))}
                    </ol>
                    <BracketView rounds={describeBracket(plan.format, plan.matches, (id) => nickname.get(id) ?? `Player ${id}`)} />
                </>
            )}
        </AdminShell>
    );
}
