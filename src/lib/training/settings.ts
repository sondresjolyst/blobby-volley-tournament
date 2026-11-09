// The settings of a training match against a bot that the game server runs.
import { DEFAULT_RULES } from '@/lib/bracket';
import { fitsScoreToWin, isGameRules } from '@/lib/matches/rules';
import { DEFAULT_GAME_SPEED, DEFAULT_SCORE_TO_WIN, formNumber, isScoreToWin } from '@/lib/matches/settings';

/** The bot scripts in data/scripts of the game, without .lua. */
export const TRAINING_BOTS = ['reduced', 'axji-0-2', 'com_11', 'gintonicV9', 'hyp014', 'Union'] as const;
export type TrainingBot = (typeof TRAINING_BOTS)[number];

/** The bot a new training match gets. */
export const DEFAULT_BOT: TrainingBot = 'reduced';

/** 0 is the strongest bot and 25 the weakest, as in the options of the game. */
export const MIN_DIFFICULTY = 0;
export const MAX_DIFFICULTY = 25;
/** A friendly bot for a first try, a little weaker than the computer player of a new local game. */
export const DEFAULT_DIFFICULTY = 15;

/** Training always runs at normal speed. */
export const TRAINING_SPEED = DEFAULT_GAME_SPEED;

export const isTrainingBot = (value: unknown): value is TrainingBot => typeof value === 'string' && (TRAINING_BOTS as readonly string[]).includes(value);

export const isDifficulty = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= MIN_DIFFICULTY && (n as number) <= MAX_DIFFICULTY;

/** The rules a training match can use: the same list as a 1v1 match, with points the game server can report. */
export const isTrainingRules = (ruleFile: unknown, scoreToWin: number): ruleFile is string => isGameRules(ruleFile) && fitsScoreToWin(ruleFile, scoreToWin);

export interface TrainingOptions {
    bot: TrainingBot;
    difficulty: number;
    ruleFile: string;
    scoreToWin: number;
}

/** Reads the training form. An empty field gives its default. Returns null when a field is wrong. */
export function parseTrainingForm(form: Record<string, string>): TrainingOptions | null {
    const bot = (form.bot ?? '').trim() || DEFAULT_BOT;
    const ruleFile = (form.ruleFile ?? '').trim() || DEFAULT_RULES;
    const difficulty = formNumber(form.difficulty ?? '', DEFAULT_DIFFICULTY);
    const scoreToWin = formNumber(form.scoreToWin ?? '', DEFAULT_SCORE_TO_WIN);
    if (!isTrainingBot(bot) || !isDifficulty(difficulty) || !isScoreToWin(scoreToWin) || !isTrainingRules(ruleFile, scoreToWin)) return null;
    return { bot, difficulty, ruleFile, scoreToWin };
}
