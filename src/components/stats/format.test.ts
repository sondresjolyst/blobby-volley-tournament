import { describe, expect, it } from 'vitest';
import { number, odds, percent, ratingChange, signed } from './format';

describe('stats format', () => {
    it('writes numbers the Norwegian way', () => {
        expect(number(3420)).toBe('3\u00a0420');
        expect(percent(0.818)).toBe('82 %');
        expect(percent(null)).toBe('-');
    });

    it('puts a sign on changes but not on 0', () => {
        expect(signed(84.4)).toBe('+84');
        expect(signed(-1180)).toBe('-1\u00a0180');
        expect(signed(0.2)).toBe('0');
    });

    it('works out a rating change from the shown ratings', () => {
        expect(ratingChange(1000.4, 1016.6)).toBe('+17');
        expect(ratingChange(1000, 1000)).toBe('0');
    });

    it('writes odds with two decimals and a decimal comma', () => {
        expect(odds(4.2)).toBe('4,20×');
        expect(odds(400 / 300)).toBe('1,33×');
        expect(odds(2)).toBe('2,00×');
    });
});
