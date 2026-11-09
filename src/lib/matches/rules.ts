// The game rules a tournament round or a 1v1 match can use. They are the rule scripts the game
// ships in data/rules. The names and texts are in the jokey Rogaland dialect of the LAN.
import { MAX_POINTS } from './settings';

export interface GameRules {
    /** The script in data/rules of the game, such as `default.lua`. */
    file: string;
    name: string;
    description: string;
}

/**
 * The game runs the script after it sets SCORE_TO_WIN to the points the site sends. Lyn sets it to
 * 2, and Brannmur makes it 10 times bigger. Every rule set still needs a lead of 2 to win a game.
 */
export const GAME_RULES: readonly GameRules[] = [
    { file: 'default.lua', name: 'Vanlig', description: 'Vanlig Blobby. Tre touch på kvar side, poeng på kvar ballveksling, og du må vinna med to.' },
    { file: 'classic.lua', name: 'Klassisk', description: 'Gamle regla. Du får bare poeng på din eigen serve. Vinne du ballen på motstandaren sin serve, får du bare serven.' },
    { file: 'blitz.lua', name: 'Lyn', description: 'Alltid først te 2 poeng, same ka dåkke velge. Over på eit blunk.' },
    { file: 'one_hit_wonder.lua', name: 'Eitt slag', description: 'Bare eitt touch på kvar side. Ballen må over med ein gang.' },
    { file: 'the_double.lua', name: 'Dobbel', description: 'Akkurat to touch på kvar side. Eitt e for lite, tre e for mykje.' },
    { file: 'tennis.lua', name: 'Tennis', description: 'Eitt touch på kvar side, og ballen kan sprett éin gang på din side før du slår.' },
    { file: 'jumping_jack.lua', name: 'Hoppetusse', description: 'Blobbane hoppe heile tida. Du styre bare sidelengs.' },
    { file: 'sticky_mode.lua', name: 'Limfot', description: 'Ingen hopping mens ballen e i spel. Føtene står limt te bakken.' },
    { file: 'back_defence.lua', name: 'Bakforsvar', description: 'Før du har touchet ballen, kan du ikkje hoppa på den delen av banen din som e nærmast nettet.' },
    { file: 'firewall.lua', name: 'Brannmur', description: 'Vanlige poeng tel 10. Treff du veggen, får motstandaren 1 poeng. Først te 15 blir først te 150.' },
];

const BY_FILE = new Map(GAME_RULES.map((r) => [r.file, r]));

/** The short text that explains rules other than the normal ones. Null for the normal rules and for a file outside the list. */
export function rulesNote(file: string): string | null {
    return file === GAME_RULES[0].file ? null : (BY_FILE.get(file)?.description ?? null);
}

/** True when the file is one of GAME_RULES. Forms only take these. */
export function isGameRules(file: unknown): file is string {
    return typeof file === 'string' && BY_FILE.has(file);
}

/** The short name of the rules, such as `Lyn`. A file outside the list, such as from an old match, shows its file name. */
export function rulesName(file: string): string {
    return BY_FILE.get(file)?.name ?? file;
}

/** The points that really win a game with these rules, when the site sends scoreToWin to the game. */
export function realScoreToWin(file: string, scoreToWin: number): number {
    if (file === 'blitz.lua') return 2;
    if (file === 'firewall.lua') return scoreToWin * 10;
    return scoreToWin;
}

/** True when the rules ignore the points chosen on the site. */
export const fixedScoreToWin = (file: string) => file === 'blitz.lua';

/**
 * The highest real points to win a form takes. A report is refused above MAX_POINTS, so a game
 * must end well below it. Only Brannmur gets near: 90 points there means 900.
 */
export const MAX_REAL_SCORE_TO_WIN = MAX_POINTS - 100;

/** True when the rules and points give a game the game server can report. */
export const fitsScoreToWin = (file: string, scoreToWin: number) => realScoreToWin(file, scoreToWin) <= MAX_REAL_SCORE_TO_WIN;
