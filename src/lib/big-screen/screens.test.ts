import { describe, expect, it } from 'vitest';
import { DEFAULT_ROTATION, parseRotationInput, parseScreenType, toRotation } from './screens';

describe('parseScreenType', () => {
    it('reads a known screen and nothing else', () => {
        expect(parseScreenType('bracket')).toBe('bracket');
        expect(parseScreenType('winner')).toBe('winner');
        for (const value of ['', 'Bracket', 'toString', '__proto__', undefined, ['stats'], 3]) expect(parseScreenType(value)).toBeNull();
    });
});

describe('parseRotationInput', () => {
    it('puts the screens that are on in the order of their numbers', () => {
        const form = { show_overview: 'on', order_overview: '3', show_stats: 'on', order_stats: '1', show_bracket: 'on', order_bracket: '2', order_foza: '4', seconds: '45' };
        expect(parseRotationInput(form)).toEqual({ ok: true, value: { screens: ['stats', 'bracket', 'overview'], seconds: 45 } });
    });

    it('keeps the list order for equal or missing numbers', () => {
        const form = { show_winner: 'on', show_overview: 'on', order_overview: '2', order_winner: '2', show_next: 'on', order_next: 'x', seconds: '60' };
        expect(parseRotationInput(form)).toEqual({ ok: true, value: { screens: ['overview', 'winner', 'next'], seconds: 60 } });
    });

    it('takes one screen, which means no rotation', () => {
        expect(parseRotationInput({ show_bracket: 'on', seconds: '10' })).toEqual({ ok: true, value: { screens: ['bracket'], seconds: 10 } });
    });

    it('refuses no screens and a time out of bounds', () => {
        expect(parseRotationInput({ seconds: '60' })).toEqual({ ok: false, error: 'bigScreenNone' });
        for (const seconds of ['9', '601', '', '60.5', '-20', '1e2', undefined]) expect(parseRotationInput({ show_overview: 'on', seconds })).toEqual({ ok: false, error: 'bigScreenSeconds' });
        expect(parseRotationInput({ show_overview: 'on', seconds: '600' })).toMatchObject({ ok: true });
    });
});

describe('toRotation', () => {
    it('drops unknown and repeated screens and falls back to the overview alone', () => {
        expect(toRotation(['stats', 'nope', 'stats', 'overview'], 30)).toEqual({ screens: ['stats', 'overview'], seconds: 30 });
        expect(toRotation([], 30)).toEqual({ screens: ['overview'], seconds: 30 });
        expect(toRotation(null, 5)).toEqual(DEFAULT_ROTATION);
        expect(DEFAULT_ROTATION).toEqual({ screens: ['overview'], seconds: 60 });
    });
});
