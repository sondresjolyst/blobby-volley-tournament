import { describe, expect, it } from 'vitest';
import { ELO_INFO, eloExamples } from './elo-text';

describe('elo examples', () => {
    it('match the gains of the rating code', () => {
        expect(eloExamples().map(({ winner, loser, chance, gain }) => ({ winner, loser, chance, gain }))).toEqual([
            { winner: 1000, loser: 1000, chance: 50, gain: 16 },
            { winner: 1200, loser: 1000, chance: 76, gain: 8 },
            { winner: 1000, loser: 1200, chance: 24, gain: 24 },
            { winner: 1400, loser: 1000, chance: 91, gain: 3 },
            { winner: 1000, loser: 1400, chance: 9, gain: 29 },
        ]);
    });

    it('say what equal players give', () => {
        expect(ELO_INFO.text).toContain('Alle starte på 1000.');
        expect(ELO_INFO.text).toContain('Lika gode spelara gir 16 poeng.');
    });
});
