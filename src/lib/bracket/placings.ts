import type { Bracket, BracketMatch, MatchLink, Placing, PlacingRule } from './types';

/** The two players of each match once the given results are played. A slot is null until it is filled. */
export function playersAfter(bracket: { matches: readonly Pick<BracketMatch, 'id' | 'players' | 'winnerTo' | 'loserTo'>[] }, winners: ReadonlyMap<number, number>) {
    const slots = new Map(bracket.matches.map((m) => [m.id, [...m.players] as [number | null, number | null]]));
    const place = (link: MatchLink | null, player: number) => {
        if (link) slots.get(link.matchId)![link.slot - 1] = player;
    };
    for (const match of bracket.matches) {
        const winner = winners.get(match.id);
        if (winner === undefined) continue;
        const [a, b] = slots.get(match.id)!;
        if (a === null || b === null || (winner !== a && winner !== b)) throw new Error(`The winner of match ${match.id} is not one of its players.`);
        place(match.winnerTo, winner);
        place(match.loserTo, winner === a ? b : a);
    }
    return slots;
}

/**
 * The final places decided so far. `winners` holds the winner of each played match by match id.
 * Players who share a place, such as two semifinal losers, get the same place.
 */
export function placings(bracket: Bracket, rules: readonly PlacingRule[], winners: ReadonlyMap<number, number>): Placing[] {
    const slots = playersAfter(bracket, winners);
    const result: Placing[] = [];
    for (const rule of rules) {
        const winner = winners.get(rule.matchId);
        if (winner === undefined) continue;
        const [a, b] = slots.get(rule.matchId)!;
        result.push({ place: rule.place, playerId: rule.result === 'winner' ? winner : winner === a ? b! : a! });
    }
    return result.sort((x, y) => x.place - y.place || x.playerId - y.playerId);
}
