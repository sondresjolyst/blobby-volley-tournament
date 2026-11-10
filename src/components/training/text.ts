// The words of training against the bot of the game server, in the Rogaland dialect of the LAN.
import { MAX_DIFFICULTY, MIN_DIFFICULTY } from '@/lib/training/settings';
import { realScoreToWin, rulesName } from '@/lib/matches/rules';
import { MAX_SCORE_TO_WIN, MIN_SCORE_TO_WIN } from '@/lib/matches/settings';

/** The badge on every training match, so nobody takes it for a real match. */
export const TRAINING_TAG = 'TRENING';

export const TRAINING_TEXT = {
    title: 'Tren mot bot',
    intro: 'Spel mot ein bot på spelserveren. Treninga telle ikkje på Foza, spel, topplistå eller turneringa.',
    bot: 'Bot',
    difficulty: 'Vanskegrad',
    difficultyHint: `${MIN_DIFFICULTY} e sterkast, ${MAX_DIFFICULTY} e svakast`,
    difficultyInfo: 'Ka betyr vanskegrad?',
    difficultyInfoText: `Kor flink boten e. ${MIN_DIFFICULTY} e sterkast og ${MAX_DIFFICULTY} e svakast. Spelet bruke 13 når du spele mot datamaskinå.`,
    start: 'Start treninga',
    stop: 'Stopp treninga',
    ready: 'Treninga di e klar',
    running: 'Treninga di e i gang',
    joinNote: 'Bli med i spelet med lenkjå di, akkurat som te ein vanlig kamp. Boten vente på deg.',
    serverNotReady: 'Spelserveren e ikkje klar ennå. Spør ein admin.',
    meLink: 'Tren mot bot',
    meReady: 'Treninga di e klar. Gå te Trening for å bli med.',
    ownTitle: 'Treninga dine',
    ownEmpty: 'Du har ikkje trent ennå.',
    noneBeaten: 'Du har ikkje slått någen bot ennå.',
    overviewTitle: 'Treningstoppen',
    overviewEmpty: 'Ingen har trent ennå.',
    trainers: 'Kem som tren mest',
    bots: 'Mest spelte bota',
    perDifficulty: 'Seira mot kvar bot',
    player: 'Spelar',
    games: 'Spelt',
    wins: 'Vunne',
    losses: 'Tapt',
    playerWins: 'Spelarane vant',
    botWins: 'Boten vant',
    waiting: 'VENTE PÅ SPELAREN',
    live: 'LIVE',
} as const;

/** Such as `Spelt 12 · vunne 5 · tapt 7`. */
export const trainingCounts = (games: number, wins: number, losses: number) => `Spelt ${games} · vunne ${wins} · tapt ${losses}`;

/** Such as `Tøffaste bot du har slått: hyp014 på vanskegrad 3`. */
export const hardestBeatenLine = (bot: string, difficulty: number) => `Tøffaste bot du har slått: ${bot} på vanskegrad ${difficulty}`;

/** Such as `Ola vs Bot (hyp014, vanskegrad 13)`. */
export const trainingVersus = (nickname: string, bot: string, difficulty: number) => `${nickname} vs Bot (${bot}, vanskegrad ${difficulty})`;

/** Such as `Vanlig · først te 15`, with the points the rules really play to. */
export const trainingSettings = (ruleFile: string, scoreToWin: number) => `${rulesName(ruleFile)} · først te ${realScoreToWin(ruleFile, scoreToWin)}`;

const SETTINGS = `Velg ein bot, ein vanskegrad frå ${MIN_DIFFICULTY} te ${MAX_DIFFICULTY}, regla og poeng frå ${MIN_SCORE_TO_WIN} te ${MAX_SCORE_TO_WIN}.`;

const ERRORS: Record<string, string> = {
    form: SETTINGS,
    settings: SETTINGS,
    'no-event': 'Du må vera med på LANet som e i gang.',
    'player-busy': 'Du har ein kamp som e ropt opp eller i gang. Spel den først.',
    taken: 'Du har allerede ei trening. Spel ferdig eller stopp den først.',
    'not-found': 'Fann ikkje treninga di. Kanskje ho e ferdig allerede.',
};

const NOTICES: Record<string, string> = {
    started: 'Treninga e klar. Bli med i spelet med lenkjå di.',
    stopped: 'Du stoppa treninga.',
};

/** The text for a training error code in the address. Unknown codes show nothing. */
export function trainingErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(ERRORS, code) ? ERRORS[code] : null;
}

/** The text for a training success code in the address. Unknown codes show nothing. */
export function trainingNoticeMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(NOTICES, code) ? NOTICES[code] : null;
}
