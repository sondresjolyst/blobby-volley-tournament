import { describe, expect, it } from 'vitest';
import { currentBoard, nextBoard, rotatingBoards } from './rotation';
import type { ScreenBoard } from './view';

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
