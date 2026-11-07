import type { ViewRound } from '@/lib/tournaments/view';

/** A plain list of the rounds and matches of a bracket. */
export function BracketView({ rounds }: { rounds: ViewRound[] }) {
    return (
        <>
            {rounds.map((round) => (
                <section key={round.key} aria-label={round.name}>
                    <h3>
                        {round.name}, best of {round.bestOf}, rules {round.ruleFile}
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
                                        <td>Match {match.number}</td>
                                        <td>{match.slots[0]}</td>
                                        <td>{match.slots[1]}</td>
                                        <td>{match.winnerTo}</td>
                                        <td>{match.loserTo}</td>
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
