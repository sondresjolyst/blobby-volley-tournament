import { describe, expect, it } from 'vitest';
import { stoppedGame } from './describe';

const match = { players: [{ id: 12, nickname: 'Blob' }, { id: 17, nickname: 'Skvett' }] as [{ id: number; nickname: string }, { id: number; nickname: string }] };

describe('stoppedGame', () => {
    it('names the score and the player who left', () => {
        expect(stoppedGame(match, { number: 2, points1: 7, points2: 9, leftSlot: 1 })).toBe('Game 2 abandoned at 7-9. Blob left.');
        expect(stoppedGame(match, { number: 2, points1: 7, points2: 9, leftSlot: 2 })).toBe('Game 2 abandoned at 7-9. Skvett left.');
    });

    it('says when the game server did not name anyone', () => {
        expect(stoppedGame(match, { number: 1, points1: 0, points2: 3, leftSlot: null })).toBe('Game 1 abandoned at 0-3. The game server did not say who left.');
    });
});
