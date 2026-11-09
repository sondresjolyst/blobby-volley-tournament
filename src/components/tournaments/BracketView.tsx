import { rulesName } from '@/lib/matches/rules';
import type { ViewRound } from '@/lib/tournaments/view';

/** A plain list of the rounds and matches of a bracket. */
export function BracketView({ rounds }: { rounds: ViewRound[] }) {
    return (
        <>
            {rounds.map((round) => (
                <section key={round.key} aria-label={round.name}>
                    <h3>
                        {round.name}, best of {round.bestOf}, rules {rulesName(round.ruleFile)}
                    </h3>
                    <div className="admin-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Match</th>
                                    <th>Player 1</th>
                                    <th>Player 2</th>
                                    <th>Winner goes to</th>
                                    <th>Loser goes to</th>
                                </tr>
                            </thead>
                            <tbody>
                                {round.matches.map((match) => (
                                    <tr key={match.number}>
                                        <td data-label="Match">Match {match.number}</td>
                                        <td data-label="Player 1">{match.slots[0]}</td>
                                        <td data-label="Player 2">{match.slots[1]}</td>
                                        <td data-label="Winner goes to">{match.winnerTo}</td>
                                        <td data-label="Loser goes to">{match.loserTo}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
        </>
    );
}
