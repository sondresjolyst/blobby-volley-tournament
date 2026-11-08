import { describe, expect, it } from 'vitest';
import { generateBracket, type FormatId } from '@/lib/bracket';
import { boardRoundName, buildBoard, feedName, type BoardRuntimeMatch } from './board';

const players = [11, 12, 13, 14];
const nickname = (id: number) => ({ id, nickname: `P${id}` });

/** A bracket of the four players in seed order, and a runtime match for each bracket match. */
function setup(format: FormatId, thirdPlaceMatch = false) {
    const bracket = generateBracket({ format, players, seeding: { method: 'manual', order: players }, thirdPlaceMatch });
    const runtime: BoardRuntimeMatch[] = bracket.matches.map((m) => ({
        id: 100 + m.id,
        bracketMatchId: m.id,
        state: 'upcoming',
        players: [m.players[0] === null ? null : nickname(m.players[0]), m.players[1] === null ? null : nickname(m.players[1])],
        score1: 0,
        score2: 0,
        winnerId: null,
        result: null,
    }));
    return { bracket: bracket.matches, runtime };
}

describe('feedName', () => {
    it('writes a feed long, or short for a dense bracket', () => {
        expect(feedName({ from: 'winner', match: 10 })).toBe('Vinnar av kamp 10');
        expect(feedName({ from: 'loser', match: 3 }, true)).toBe('Taper k. 3');
    });
});

describe('boardRoundName', () => {
    it('names single elimination rounds from the final back', () => {
        expect([1, 2, 3, 4].map((r) => boardRoundName('single_elimination', 'winners', r, 4))).toEqual(['Runde 1', 'Kvartfinala', 'Semifinala', 'Finale']);
        expect(boardRoundName('single_elimination', 'third_place', 1, 1)).toBe('Bronsefinale');
    });

    it('names the sides of double elimination and the grand final', () => {
        expect(boardRoundName('double_elimination', 'winners', 1, 2)).toBe('Vinnarrunde 1');
        expect(boardRoundName('double_elimination', 'winners', 2, 2)).toBe('Vinnarfinale');
        expect(boardRoundName('double_elimination', 'losers', 1, 2)).toBe('Taperrunde 1');
        expect(boardRoundName('double_elimination', 'losers', 2, 2)).toBe('Taperfinale');
        expect(boardRoundName('double_elimination', 'final', 1, 1)).toBe('Storfinale');
    });
});

describe('buildBoard', () => {
    it('lays out single elimination with the third place match after the final and names the open slots', () => {
        const { bracket, runtime } = setup('single_elimination', true);
        const board = buildBoard('single_elimination', bracket, runtime, 11, new Set([101]));
        expect(board.map((s) => s.key)).toEqual(['main']);
        expect(board[0].rounds.map((r) => r.name)).toEqual(['Semifinala', 'Finale', 'Bronsefinale']);
        const [semi1] = board[0].rounds[0].matches;
        expect(semi1).toMatchObject({ matchId: 101, number: 1, status: 'Snart', mine: true, openForBets: true });
        expect(semi1.slots.map((s) => [s.name, s.mine, s.score])).toEqual([
            ['P11', true, null],
            ['P14', false, null],
        ]);
        expect(board[0].rounds[1].matches[0].slots.map((s) => s.name)).toEqual(['Vinnar av kamp 1', 'Vinnar av kamp 2']);
        expect(board[0].rounds[2].matches[0].slots.map((s) => s.name)).toEqual(['Taper av kamp 1', 'Taper av kamp 2']);
        expect(board[0].rounds[1].matches[0].slots.map((s) => s.feed)).toEqual([
            { from: 'winner', match: 1 },
            { from: 'winner', match: 2 },
        ]);
        expect(board[0].rounds[0].matches[0].slots.every((s) => s.feed === null)).toBe(true);
        expect(board[0].rounds[1].matches[0]).toMatchObject({ mine: false, openForBets: false });
    });

    it('shows the series score from the start, and the winner and loser once finished', () => {
        const { bracket, runtime } = setup('single_elimination');
        runtime[0] = { ...runtime[0], state: 'finished', score1: 2, score2: 1, winnerId: 11, result: 'played' };
        runtime[1] = { ...runtime[1], state: 'started', score1: 0, score2: 1 };
        const board = buildBoard('single_elimination', bracket, runtime, null, new Set());
        const [done, live] = board[0].rounds[0].matches;
        expect(done.status).toBe('Ferdig');
        expect(done.slots.map((s) => [s.score, s.outcome])).toEqual([
            [2, 'won'],
            [1, 'lost'],
        ]);
        expect(live.status).toBe('LIVE');
        expect(live.slots.map((s) => [s.score, s.outcome])).toEqual([
            [0, null],
            [1, null],
        ]);
    });

    it('hides the score of a no-show and calls it a walkover', () => {
        const { bracket, runtime } = setup('single_elimination');
        runtime[0] = { ...runtime[0], state: 'finished', winnerId: 14, result: 'forfeit' };
        const [match] = buildBoard('single_elimination', bracket, runtime, null, new Set())[0].rounds[0].matches;
        expect(match.status).toBe('Walkover');
        expect(match.slots.map((s) => [s.score, s.outcome])).toEqual([
            [null, 'lost'],
            [null, 'won'],
        ]);
    });

    it('puts the losers bracket of double elimination in its own section and the grand final last', () => {
        const { bracket, runtime } = setup('double_elimination');
        const board = buildBoard('double_elimination', bracket, runtime, null, new Set());
        expect(board.map((s) => s.key)).toEqual(['main', 'losers']);
        expect(board[0].rounds.map((r) => r.name)).toEqual(['Vinnarrunde 1', 'Vinnarfinale', 'Storfinale']);
        expect(board[1].rounds.map((r) => r.name)).toEqual(['Taperrunde 1', 'Taperfinale']);
        const numbers = board.flatMap((s) => s.rounds.flatMap((r) => r.matches.map((m) => m.number)));
        expect(numbers.toSorted((a, b) => a - b)).toEqual(bracket.map((_, i) => i + 1));
    });
});
