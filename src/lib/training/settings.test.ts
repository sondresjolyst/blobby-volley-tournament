import { describe, expect, it } from 'vitest';
import { DEFAULT_BOT, DEFAULT_DIFFICULTY, parseTrainingForm, TRAINING_BOTS } from './settings';

describe('parseTrainingForm', () => {
    it('gives the defaults for an empty form', () => {
        expect(parseTrainingForm({})).toEqual({ bot: DEFAULT_BOT, difficulty: DEFAULT_DIFFICULTY, ruleFile: 'default.lua', scoreToWin: 15 });
    });

    it('reads every field', () => {
        expect(parseTrainingForm({ bot: 'hyp014', difficulty: '0', ruleFile: 'blitz.lua', scoreToWin: '7' })).toEqual({ bot: 'hyp014', difficulty: 0, ruleFile: 'blitz.lua', scoreToWin: 7 });
    });

    it('knows the bot scripts of the game', () => {
        expect(TRAINING_BOTS).toEqual(['reduced', 'axji-0-2', 'com_11', 'gintonicV9', 'hyp014', 'Union']);
        for (const bot of TRAINING_BOTS) expect(parseTrainingForm({ bot })).not.toBeNull();
    });

    it('refuses an unknown bot, rules file, difficulty or score', () => {
        expect(parseTrainingForm({ bot: 'old/reduced' })).toBeNull();
        expect(parseTrainingForm({ bot: 'nosuchbot' })).toBeNull();
        expect(parseTrainingForm({ ruleFile: '../x.lua' })).toBeNull();
        expect(parseTrainingForm({ ruleFile: 'other.lua' })).toBeNull();
        expect(parseTrainingForm({ difficulty: '26' })).toBeNull();
        expect(parseTrainingForm({ difficulty: '-1' })).toBeNull();
        expect(parseTrainingForm({ difficulty: '1.5' })).toBeNull();
        expect(parseTrainingForm({ scoreToWin: '0' })).toBeNull();
        expect(parseTrainingForm({ scoreToWin: '100' })).toBeNull();
    });
});
