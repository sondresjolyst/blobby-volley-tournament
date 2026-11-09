import { describe, expect, it } from 'vitest';
import { keptListQuery, matchesSearch, pageLinks, pageOf, parsePage, parseSearch, withListQuery } from './paging';

describe('parsePage', () => {
    it('reads a whole number from 1', () => {
        expect(parsePage('1')).toBe(1);
        expect(parsePage('12')).toBe(12);
    });

    it('reads anything else as page 1', () => {
        for (const value of [undefined, '', '0', '-2', '1.5', '02', 'abc', ['2'], '9999999']) expect(parsePage(value)).toBe(1);
    });
});

describe('parseSearch', () => {
    it('trims and cuts the text', () => {
        expect(parseSearch('  abc ')).toBe('abc');
        expect(parseSearch('x'.repeat(80))).toHaveLength(60);
        expect(parseSearch(['abc'])).toBe('');
        expect(parseSearch(undefined)).toBe('');
    });
});

describe('matchesSearch', () => {
    it('finds the search in any of the texts, in any case', () => {
        expect(matchesSearch('', 'anything')).toBe(true);
        expect(matchesSearch('bob', 'Alice', 'BOBBY')).toBe(true);
        expect(matchesSearch('bob', 'Alice')).toBe(false);
    });
});

describe('pageOf', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);

    it('gives 10 rows a page', () => {
        expect(pageOf(items, 1)).toEqual({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 1, pages: 3, total: 25, first: 1, last: 10 });
        expect(pageOf(items, 3)).toEqual({ items: [21, 22, 23, 24, 25], page: 3, pages: 3, total: 25, first: 21, last: 25 });
    });

    it('shows the last page for a page after it', () => {
        expect(pageOf(items, 9).page).toBe(3);
    });

    it('has one empty page without rows', () => {
        expect(pageOf([], 4)).toEqual({ items: [], page: 1, pages: 1, total: 0, first: 0, last: 0 });
    });
});

describe('pageLinks', () => {
    it('lists every page of a short list', () => {
        expect(pageLinks(1, 1)).toEqual([1]);
        expect(pageLinks(2, 4)).toEqual([1, 2, 3, 4]);
    });

    it('leaves gaps in a long list', () => {
        expect(pageLinks(1, 10)).toEqual([1, 2, 'gap', 10]);
        expect(pageLinks(6, 10)).toEqual([1, 'gap', 5, 6, 7, 'gap', 10]);
        expect(pageLinks(10, 10)).toEqual([1, 'gap', 9, 10]);
    });

    it('shows a single left out page instead of a gap', () => {
        expect(pageLinks(4, 10)).toEqual([1, 2, 3, 4, 5, 'gap', 10]);
        expect(pageLinks(7, 10)).toEqual([1, 'gap', 6, 7, 8, 9, 10]);
    });
});

describe('keptListQuery', () => {
    it('keeps valid pages and the search', () => {
        expect(keptListQuery({ players: '2', q: ' ab ', pin: '1234' }, ['players']).toString()).toBe('players=2&q=ab');
    });

    it('leaves out page 1, bad pages and an empty search', () => {
        expect(keptListQuery({ upcoming: '1', called: 'x', q: '  ' }, ['upcoming', 'called']).toString()).toBe('');
    });
});

describe('withListQuery', () => {
    it('puts the list query before the notice', () => {
        expect(withListQuery('/admin/events/1', new URLSearchParams('players=2'), 'reset=5')).toBe('/admin/events/1?players=2&reset=5');
        expect(withListQuery('/admin/events/1', new URLSearchParams(), 'reset=5')).toBe('/admin/events/1?reset=5');
        expect(withListQuery('/admin/matches', new URLSearchParams(), '')).toBe('/admin/matches');
    });
});
