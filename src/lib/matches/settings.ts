/** A game is won by the first player to this many points. */
export const DEFAULT_SCORE_TO_WIN = 15;
export const MIN_SCORE_TO_WIN = 1;
export const MAX_SCORE_TO_WIN = 99;

/** The game speed in frames per second. The game offers 30 to 120, and 75 is normal speed. */
export const DEFAULT_GAME_SPEED = 75;
export const MIN_GAME_SPEED = 30;
export const MAX_GAME_SPEED = 120;

export const isScoreToWin = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= MIN_SCORE_TO_WIN && (n as number) <= MAX_SCORE_TO_WIN;

export const isGameSpeed = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= MIN_GAME_SPEED && (n as number) <= MAX_GAME_SPEED;

/** Reads a whole number from a form field. An empty field gives the default. Returns null when it is not a whole number. */
export function formNumber(value: string, fallback: number): number | null {
    const text = value.trim();
    if (text === '') return fallback;
    return /^[0-9]{1,4}$/.test(text) ? Number(text) : null;
}
