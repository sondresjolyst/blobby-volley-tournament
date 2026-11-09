import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentBoard, currentScreen, nextBoard, nextTurn, rotatingBoards, rotatingScreens, screenHasContent, screenMs, shownScreen, startScreenTurns, type ScreenContent } from './rotation';
import { SCREEN_TYPES, type ScreenType } from './screens';
import type { ScreenBoard, ScreenMatch, ScreenWinner } from './view';

const row = { rank: 1, nickname: 'Ostebit', value: '1' };
const boards = (filled: Record<ScreenBoard['key'], boolean>): ScreenBoard[] =>
    (['foza', 'sigra', 'elo'] as const).map((key) => ({ key, rows: filled[key] ? [row] : [] }));

describe('rotatingBoards', () => {
    it('skips empty boards, and keeps the first one when all are empty', () => {
        expect(rotatingBoards(boards({ foza: false, sigra: true, elo: true })).map((b) => b.key)).toEqual(['sigra', 'elo']);
        expect(rotatingBoards(boards({ foza: false, sigra: false, elo: false })).map((b) => b.key)).toEqual(['foza']);
        expect(rotatingBoards([])).toEqual([]);
    });
});

describe('nextBoard', () => {
    const all = boards({ foza: true, sigra: true, elo: true });

    it('goes through the boards in turn and starts over', () => {
        expect(nextBoard(all, null)).toBe('foza');
        expect(nextBoard(all, 'foza')).toBe('sigra');
        expect(nextBoard(all, 'sigra')).toBe('elo');
        expect(nextBoard(all, 'elo')).toBe('foza');
    });

    it('skips a board that went empty and stays put with one board', () => {
        expect(nextBoard(boards({ foza: true, sigra: false, elo: true }), 'foza')).toBe('elo');
        expect(nextBoard(boards({ foza: false, sigra: false, elo: true }), 'elo')).toBe('elo');
        expect(nextBoard([], 'elo')).toBeNull();
    });
});

describe('currentBoard', () => {
    it('keeps the current board while it can show, otherwise the first that can', () => {
        expect(currentBoard(boards({ foza: true, sigra: true, elo: true }), 'sigra')?.key).toBe('sigra');
        expect(currentBoard(boards({ foza: true, sigra: false, elo: true }), 'sigra')?.key).toBe('foza');
        expect(currentBoard(boards({ foza: true, sigra: true, elo: true }), null)?.key).toBe('foza');
        expect(currentBoard([], null)).toBeNull();
    });
});


describe('the screen rotation', () => {
    const match = { matchId: 1 } as ScreenMatch;
    const winner: ScreenWinner = { tournamentId: 1, tournamentName: 'Hovedcupen', champion: 'Ostebit', podium: [], final: null };
    const sponsor = { id: 1, name: 'Pizzabakeren', src: '/x', width: 3, height: 1, background: null };
    const fact = { key: 'wins' as const, label: 'Flest seira', value: '3 seira', who: 'Ostebit' };
    const full = { tournamentId: 1, name: 'Hovedcupen', dense: false, sections: [] };
    /** Every screen has something to show, except those in `empty`. */
    function content(screens: ScreenType[], empty: readonly ScreenType[] = [], seconds = 60): ScreenContent {
        const has = (type: ScreenType) => !empty.includes(type);
        return {
            rotation: { screens, seconds },
            fullBracket: has('bracket') ? full : null,
            upNext: has('next') ? [match] : [],
            foza: { bettors: has('foza') ? [{ nickname: 'Ostebit', net: 40, correct: 1, bets: 1 }] : [], wins: [] },
            facts: has('stats') ? [fact] : [],
            sponsors: has('sponsors') ? [sponsor] : [],
            winner: has('winner') ? winner : null,
            duels: { live: [], training: [], liveMore: 0, done: [], coming: has('duels') ? [match] : [] },
        };
    }
    const ALL_EMPTY: ScreenType[] = ['bracket', 'next', 'foza', 'duels', 'stats', 'sponsors', 'winner'];

    it('goes through the screens in the order the admin set and starts over', () => {
        const data = content(['stats', 'overview', 'bracket']);
        expect(currentScreen(data, 0)).toBe('stats');
        expect([nextTurn(data, 0), nextTurn(data, 1), nextTurn(data, 2)]).toEqual([1, 2, 0]);
        expect(currentScreen(data, 2)).toBe('bracket');
    });

    it('stays on one screen when only one is on', () => {
        const data = content(['next']);
        expect(rotatingScreens(data)).toEqual(['next']);
        expect(nextTurn(data, 0)).toBe(0);
        expect(currentScreen(content(['overview']), nextTurn(content(['overview']), 0))).toBe('overview');
    });

    it('keeps each screen up for the time the admin set', () => {
        expect(screenMs(content(['overview']))).toBe(60_000);
        expect(screenMs(content(['overview', 'stats'], [], 15))).toBe(15_000);
    });

    it('skips screens with nothing to show, and never shows the winner screen without a winner', () => {
        expect(rotatingScreens(content(['winner', 'stats', 'sponsors', 'bracket', 'foza', 'next', 'duels', 'overview'], ALL_EMPTY))).toEqual(['overview']);
        expect(currentScreen(content(['winner'], ALL_EMPTY), 0)).toBe('overview');
        expect(currentScreen(content(['winner', 'stats'], ALL_EMPTY), 0)).toBe('stats');
        expect(currentScreen(content(['winner', 'stats'], ['winner']), 0)).toBe('stats');
        expect(currentScreen(content(['winner', 'stats']), 0)).toBe('winner');
        for (const type of SCREEN_TYPES) expect(screenHasContent(type, content([]))).toBe(true);
        expect(SCREEN_TYPES.filter((type) => screenHasContent(type, content([], ALL_EMPTY)))).toEqual(['overview']);
    });

    it('moves on to the next screen in order when the one on show empties mid turn', () => {
        const order: ScreenType[] = ['overview', 'stats', 'foza', 'bracket'];
        // Turn 1 is stats. It empties, so foza shows, and the next tick goes on to bracket, not back to the start.
        const data = content(order, ['stats']);
        expect(currentScreen(data, 1)).toBe('foza');
        expect(nextTurn(data, 1)).toBe(3);
        // The last screen empties: the turn wraps round to the first.
        expect(currentScreen(content(order, ['bracket']), 3)).toBe('overview');
    });

    it('follows a change of the screens that comes with a refresh', () => {
        // A shorter list wraps the turn round, and an empty list keeps the overview.
        expect(currentScreen(content(['next', 'bracket']), 3)).toBe('bracket');
        expect(currentScreen(content(['stats', 'bracket']), 1)).toBe('bracket');
        expect(currentScreen(content([]), 2)).toBe('overview');
    });

    it('lets a screen pinned in the address win over the rotation', () => {
        const data = content(['overview', 'stats']);
        expect(shownScreen(data, 1, 'bracket')).toBe('bracket');
        expect(shownScreen(content(['overview'], ALL_EMPTY), 0, 'sponsors')).toBe('sponsors');
        expect(shownScreen(data, 1, null)).toBe('stats');
        expect(shownScreen(data, 0, 'winner')).toBe('winner');
        expect(shownScreen(content(['overview', 'stats'], ALL_EMPTY), 0, 'winner')).toBe('overview');
    });
});

describe('startScreenTurns', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const data = (screens: ScreenType[], seconds = 10): ScreenContent => ({
        rotation: { screens, seconds },
        fullBracket: { tournamentId: 1, name: 'Hovedcupen', dense: false, sections: [] },
        upNext: [],
        foza: { bettors: [], wins: [] },
        facts: [{ key: 'wins', label: 'Flest seira', value: '3 seira', who: 'Ostebit' }],
        sponsors: [],
        winner: null,
        duels: { live: [], training: [], liveMore: 0, done: [], coming: [] },
    });

    /** Runs the turns like the page does, with the turn in a plain variable. */
    function run(ms: number, pinned: ScreenType | null, read: () => ScreenContent) {
        const state = { turn: 0 };
        const stop = startScreenTurns(ms, pinned, read, (next) => {
            state.turn = next(state.turn);
        });
        return { state, stop };
    }

    it('moves the turn on every time, in order, and stops on cleanup', () => {
        const { state, stop } = run(10_000, null, () => data(['overview', 'stats', 'bracket']));
        vi.advanceTimersByTime(9_999);
        expect(state.turn).toBe(0);
        vi.advanceTimersByTime(1);
        expect(state.turn).toBe(1);
        vi.advanceTimersByTime(20_000);
        expect(state.turn).toBe(0);
        stop();
        vi.advanceTimersByTime(60_000);
        expect(state.turn).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('counts the new time from the change when the time changes', () => {
        const first = run(60_000, null, () => data(['overview', 'stats']));
        vi.advanceTimersByTime(50_000);
        // The page stops the old timer and starts one with the new time.
        first.stop();
        const state = first.state;
        const stop = startScreenTurns(10_000, null, () => data(['overview', 'stats'], 10), (next) => {
            state.turn = next(state.turn);
        });
        vi.advanceTimersByTime(9_999);
        expect(state.turn).toBe(0);
        vi.advanceTimersByTime(1);
        expect(state.turn).toBe(1);
        stop();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('starts no timer for a pinned screen', () => {
        const { state, stop } = run(10_000, 'bracket', () => data(['overview', 'stats']));
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(60_000);
        expect(state.turn).toBe(0);
        stop();
    });

    it('reads the latest data on each tick, so a screen that empties mid turn is passed over', () => {
        let latest = data(['overview', 'stats', 'bracket']);
        const { state, stop } = run(10_000, null, () => latest);
        vi.advanceTimersByTime(10_000);
        expect(currentScreen(latest, state.turn)).toBe('stats');
        // The records go away while stats is on show. The screen gives way at once, and the turn goes on to bracket.
        latest = { ...latest, facts: [] };
        expect(currentScreen(latest, state.turn)).toBe('bracket');
        vi.advanceTimersByTime(10_000);
        expect(currentScreen(latest, state.turn)).toBe('overview');
        stop();
    });
});
