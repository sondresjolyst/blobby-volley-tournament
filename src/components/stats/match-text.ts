// The words of the match page. They are written in the jokey Rogaland dialect of the LAN.
import { matchSettings } from '@/components/player/text';
import { NOT_DECIDED } from '@/lib/texts';
import { trainingSettings } from '@/components/training/text';
import type { MatchStatsPage } from '@/lib/store/game-stats';

export const MATCH_TEXT = {
    possession: 'Ballinnehav',
    touches: 'Touch',
    errors: 'Feil',
    netHits: 'Nett-treff',
    rallies: 'Ballvekslingar',
    longestRally: 'Lengste ballveksling',
    averageRally: 'Snitt ballveksling',
    noStats: 'Ingen statistikk for denne kampen',
    noStatsYet: 'Ingen statistikk ennå',
    whole: 'Heile kampen',
    noGames: 'Ingen kampa e spelt ennå.',
    waiting: 'Vente på at spelet skal starta.',
    live: 'LIVE',
    cancelled: 'Denne kampen blei avlyst.',
    backToBracket: 'Tebake te kampoppsettet',
    backToTraining: 'Tebake te treninga',
    seeMatch: 'Sjå kampen',
    walkover: 'Walkover',
    walkoverNote: 'Kampen blei avgjort på walkover. Ingen kampa e spelt.',
    backToResults: 'Tebake te resultata',
    backToLeaderboard: 'Tebake te topplistå',
} as const;

/** Such as `Kamp 2`. */
export const gameTitle = (game: number) => `Kamp ${game}`;

/** Such as `Kamp 2 · LIVE`. */
export const liveTitle = (game: number) => `${gameTitle(game)} · ${MATCH_TEXT.live}`;

/** The name of a player that is not known yet. */
export const UNKNOWN_PLAYER = NOT_DECIDED;

/** The title of the page, such as `Ola mot Kari`. */
export const matchTitle = (page: Pick<MatchStatsPage, 'names'>) => `${page.names[0] ?? UNKNOWN_PLAYER} vs ${page.names[1] ?? UNKNOWN_PLAYER}`;

/** Such as `Best av 3 · Tennis · først te 15 · 75 fps`, and for training the bot first, such as `Bot hyp014 · vanskegrad 13 · Vanlig · først te 15 · 75 fps`. */
export function settingsLine(page: Pick<MatchStatsPage, 'bestOf' | 'ruleFile' | 'scoreToWin' | 'speed' | 'bot'>): string {
    if (page.bestOf === null || page.bot !== null) {
        const bot = page.bot ? `Bot ${page.bot.name} · vanskegrad ${page.bot.difficulty} · ` : '';
        return `${bot}${trainingSettings(page.ruleFile, page.scoreToWin)} · ${page.speed} fps`;
    }
    return matchSettings({ bestOf: page.bestOf, ruleFile: page.ruleFile, scoreToWin: page.scoreToWin, speed: page.speed });
}
