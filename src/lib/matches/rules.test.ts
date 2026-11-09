import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@/lib/bracket';
import { fitsScoreToWin, fixedScoreToWin, GAME_RULES, isGameRules, realScoreToWin, rulesName } from './rules';

describe('game rules', () => {
    it('lists the ten rule scripts of the game, with the normal rules first', () => {
        expect(GAME_RULES.map((r) => r.file)).toEqual([
            'default.lua',
            'classic.lua',
            'blitz.lua',
            'one_hit_wonder.lua',
            'the_double.lua',
            'tennis.lua',
            'jumping_jack.lua',
            'sticky_mode.lua',
            'back_defence.lua',
            'firewall.lua',
        ]);
        expect(GAME_RULES[0].file).toBe(DEFAULT_RULES);
        for (const rules of GAME_RULES) {
            expect(rules.name.length).toBeGreaterThan(0);
            expect(rules.description).toMatch(/\.$/);
        }
        expect(new Set(GAME_RULES.map((r) => r.name)).size).toBe(GAME_RULES.length);
    });

    it('takes only listed files', () => {
        expect(isGameRules('tennis.lua')).toBe(true);
        for (const bad of ['fun.lua', 'tennis', '', '../tennis.lua', 'constructor', 3, null]) expect(isGameRules(bad)).toBe(false);
    });

    it('shows the friendly name, and the file name for rules outside the list', () => {
        expect(rulesName('default.lua')).toBe('Vanlig');
        expect(rulesName('tennis.lua')).toBe('Tennis');
        expect(rulesName('firewall.lua')).toBe('Brannmur');
        expect(rulesName('old.lua')).toBe('old.lua');
    });

    it('gives the points the game really plays to', () => {
        expect(realScoreToWin('default.lua', 15)).toBe(15);
        expect(realScoreToWin('tennis.lua', 7)).toBe(7);
        expect(realScoreToWin('blitz.lua', 15)).toBe(2);
        expect(realScoreToWin('firewall.lua', 15)).toBe(150);
        expect(realScoreToWin('old.lua', 21)).toBe(21);
        expect(fixedScoreToWin('blitz.lua')).toBe(true);
        expect(fixedScoreToWin('firewall.lua')).toBe(false);
        expect(fitsScoreToWin('firewall.lua', 90)).toBe(true);
        expect(fitsScoreToWin('firewall.lua', 91)).toBe(false);
        expect(fitsScoreToWin('default.lua', 99)).toBe(true);
    });
});
