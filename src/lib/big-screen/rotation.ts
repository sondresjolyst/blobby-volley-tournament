// The timers of the big screen. No browser access, so it can be tested on its own.
import type { BoardKey, ScreenBoard } from './view';

/** How long each leaderboard stays up. */
export const ROTATION_MS = 12_000;
/** How often the page reads the scores again. */
export const REFRESH_MS = 5_000;

/** The boards that take turns. Empty boards are skipped, unless all are empty, then the first one stays. */
export function rotatingBoards(boards: readonly ScreenBoard[]): ScreenBoard[] {
    const filled = boards.filter((b) => b.rows.length > 0);
    if (filled.length > 0) return filled;
    return boards.slice(0, 1);
}

/**
 * The board to show after a tick. It keeps to the same board when the list changes under it, and
 * moves to the next one in turn. A board that went away starts the turn over.
 */
export function nextBoard(boards: readonly ScreenBoard[], current: BoardKey | null): BoardKey | null {
    const shown = rotatingBoards(boards);
    if (shown.length === 0) return null;
    const at = shown.findIndex((b) => b.key === current);
    return shown[(at + 1) % shown.length].key;
}

/** The board on screen now. The current one if it can still be shown, otherwise the first that can. */
export function currentBoard(boards: readonly ScreenBoard[], current: BoardKey | null): ScreenBoard | null {
    const shown = rotatingBoards(boards);
    return shown.find((b) => b.key === current) ?? shown[0] ?? null;
}
