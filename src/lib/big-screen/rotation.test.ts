import { describe, expect, it } from 'vitest';
import { currentBoard, currentScreen, nextBoard, nextScreen, rotatingBoards, rotatingScreens, screenHasContent, screenMs, shownScreen, type ScreenContent } from './rotation';
import { SCREEN_TYPES, type ScreenType } from './screens';
import type { ScreenBoard, ScreenMatch, ScreenWinner } from './view';

const row = { rank: 1, nickname: 'Ostebit', value: '1' };
const boards = (filled: Record<ScreenBoard['key'], boolean>): ScreenBoard[] =>
    (['rette', 'sigra', 'elo'] as const).map((key) => ({ key, rows: filled[key] ? [row] : [] }));

describe('rotatingBoards', () => {
    it('skips empty boards, and keeps the first one when all are empty', () => {
        expect(rotatingBoards(boards({ rette: false, sigra: true, elo: true })).map((b) => b.key)).toEqual(['sigra', 'elo']);
        expect(rotatingBoards(boards({ rette: false, sigra: false, elo: false })).map((b) => b.key)).toEqual(['rette']);
        expect(rotatingBoards([])).toEqual([]);
    });
});

describe('nextBoard', () => {
    const all = boards({ rette: true, sigra: true, elo: true });

    it('goes through the boards in turn and starts over', () => {
        expect(nextBoard(all, null)).toBe('rette');
        expect(nextBoard(all, 'rette')).toBe('sigra');
        expect(nextBoard(all, 'sigra')).toBe('elo');
        expect(nextBoard(all, 'elo')).toBe('rette');
    });

    it('skips a board that went empty and stays put with one board', () => {
        expect(nextBoard(boards({ rette: true, sigra: false, elo: true }), 'rette')).toBe('elo');
        expect(nextBoard(boards({ rette: false, sigra: false, elo: true }), 'elo')).toBe('elo');
        expect(nextBoard([], 'elo')).toBeNull();
    });
});

describe('currentBoard', () => {
    it('keeps the current board while it can show, otherwise the first that can', () => {
        expect(currentBoard(boards({ rette: true, sigra: true, elo: true }), 'sigra')?.key).toBe('sigra');
        expect(currentBoard(boards({ rette: true, sigra: false, elo: true }), 'sigra')?.key).toBe('rette');
        expect(currentBoard(boards({ rette: true, sigra: true, elo: true }), null)?.key).toBe('rette');
        expect(currentBoard([], null)).toBeNull();
    });
});

describe('the screen rotation', () => {
    const match = { matchId: 1 } as ScreenMatch;
    const winner: ScreenWinner = { tournamentId: 1, tournamentName: 'Hovedcupen', champion: 'Ostebit', podium: [], final: null };
    const sponsor = { id: 1, name: 'Pizzabakeren', src: '/x', width: 3, height: 1 };
    const fact = { key: 'wins' as const, label: 'Flest sigra', value: '3 sigra', who: 'Ostebit' };
    const full = { tournamentId: 1, name: 'Hovedcupen', sections: [] };
    function content(screens: ScreenType[], filled = true, seconds = 60): ScreenContent {
        return {
            rotation: { screens, seconds },
            fullBracket: filled ? full : null,
            upNext: filled ? [match] : [],
            foza: { bettors: filled ? [{ nickname: 'Ostebit', net: 40, correct: 1, bets: 1 }] : [], wins: [] },
            facts: filled ? [fact] : [],
            sponsors: filled ? [sponsor] : [],
            winner: filled ? winner : null,
        };
    }

    it('goes through the screens in the order the admin set and starts over', () => {
        const data = content(['stats', 'overview', 'bracket']);
        expect(currentScreen(data, null)).toBe('stats');
        expect(nextScreen(data, 'stats')).toBe('overview');
        expect(nextScreen(data, 'overview')).toBe('bracket');
        expect(nextScreen(data, 'bracket')).toBe('stats');
    });

    it('stays on one screen when only one is on', () => {
        const data = content(['next']);
        expect(rotatingScreens(data)).toEqual(['next']);
        expect(nextScreen(data, 'next')).toBe('next');
        expect(nextScreen(content(['overview']), 'overview')).toBe('overview');
    });

    it('keeps each screen up for the time the admin set', () => {
        expect(screenMs(content(['overview']))).toBe(60_000);
        expect(screenMs(content(['overview', 'stats'], true, 15))).toBe(15_000);
    });

    it('skips screens with nothing to show, and never shows the winner screen without a winner', () => {
        const empty = content(['winner', 'stats', 'sponsors', 'bracket', 'foza', 'next', 'overview'], false);
        expect(rotatingScreens(empty)).toEqual(['overview']);
        expect(rotatingScreens(content(['winner'], false))).toEqual(['overview']);
        expect(rotatingScreens(content(['winner', 'stats'], false))).toEqual(['stats']);
        expect(rotatingScreens(content(['winner', 'stats']))).toEqual(['winner', 'stats']);
        for (const type of SCREEN_TYPES) expect(screenHasContent(type, content([], true))).toBe(true);
        expect(SCREEN_TYPES.filter((type) => screenHasContent(type, content([], false)))).toEqual(['overview']);
    });

    it('follows a change of the screens that comes with a refresh', () => {
        // The screen on show stays while it is still on, and the turn goes on from it.
        let data = content(['overview', 'stats', 'foza']);
        expect(currentScreen(data, 'stats')).toBe('stats');
        data = content(['stats', 'bracket']);
        expect(currentScreen(data, 'stats')).toBe('stats');
        expect(nextScreen(data, currentScreen(data, 'stats'))).toBe('bracket');
        // A screen the admin turned off gives way to the first one at once.
        data = content(['next', 'bracket']);
        expect(currentScreen(data, 'stats')).toBe('next');
        expect(nextScreen(data, currentScreen(data, 'stats'))).toBe('bracket');
    });

    it('lets a screen pinned in the address win over the rotation', () => {
        const data = content(['overview', 'stats']);
        expect(shownScreen(data, 'stats', 'bracket')).toBe('bracket');
        expect(shownScreen(content(['overview'], false), null, 'sponsors')).toBe('sponsors');
        expect(shownScreen(data, 'stats', null)).toBe('stats');
        expect(shownScreen(data, 'overview', 'winner')).toBe('winner');
        expect(shownScreen(content(['overview', 'stats'], false), null, 'winner')).toBe('overview');
    });
});
