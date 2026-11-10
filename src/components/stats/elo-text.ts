// The words and the examples of the Elo explanation, on the leaderboard and on /elo, in the dialect of the LAN.
import { ELO_K, ELO_START, expectedScore, winnerGain } from '@/lib/stats/elo';

/** The short explanation behind the i button of the Elo board, and at the top of /elo. */
export const ELO_INFO = {
    label: 'Ka e Elo?',
    text: `Alle starte på ${ELO_START}. Vinn du ein kamp, får du poeng frå motstandaren. Slår du någen som e betre enn deg, får du mykje. Slår du någen som e dårligare, får du lite. Lika gode spelara gir ${ELO_K / 2} poeng. Heile kampen telle éin gong, ikkje kvart sett. Kampa som blir vunne uten å bli spelt, avlyste kampa og trening telle ikkje.`,
    link: 'Sjå utrekningå',
} as const;

export interface EloExample {
    /** What the row shows, such as `Lika gode`. */
    case: string;
    winner: number;
    loser: number;
    /** The chance the winner had before the match, as a whole percent. */
    chance: number;
    /** What the winner gains and the loser loses, as a whole number like the leaderboard shows it. */
    gain: number;
}

/** The worked examples of /elo, worked out with the same functions as the real ratings. */
export function eloExamples(): EloExample[] {
    const cases: [string, number, number][] = [
        ['Lika gode', ELO_START, ELO_START],
        ['Favoritten vinne, 200 over', ELO_START + 200, ELO_START],
        ['Underdogen vinne, 200 under', ELO_START, ELO_START + 200],
        ['Favoritten vinne, 400 over', ELO_START + 400, ELO_START],
        ['Underdogen vinne, 400 under', ELO_START, ELO_START + 400],
    ];
    return cases.map(([what, winner, loser]) => ({
        case: what,
        winner,
        loser,
        chance: Math.round(expectedScore(winner, loser) * 100),
        gain: Math.round(winnerGain(winner, loser)),
    }));
}
