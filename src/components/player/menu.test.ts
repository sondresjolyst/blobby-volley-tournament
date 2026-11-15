import { describe, expect, it } from 'vitest';
import { menuLinks } from './menu';

const hrefs = (links: { href: string }[]) => links.map((l) => l.href);

describe('menuLinks', () => {
    it('lists every link in order for a signed in player of an open event', () => {
        expect(hrefs(menuLinks({ eventOpen: true, signedIn: true }))).toEqual(['/me', '/bracket', '/resultat', '/leaderboard', '/trening', '/big', '/last-ned']);
    });

    it('leaves out Kampa when nobody is signed in', () => {
        expect(hrefs(menuLinks({ eventOpen: true, signedIn: false }))).toEqual(['/bracket', '/resultat', '/leaderboard', '/trening', '/big', '/last-ned']);
    });

    it('shows only the leaderboard and the download without an open event', () => {
        expect(hrefs(menuLinks({ eventOpen: false, signedIn: false }))).toEqual(['/leaderboard', '/last-ned']);
        expect(hrefs(menuLinks({ eventOpen: false, signedIn: true }))).toEqual(['/leaderboard', '/last-ned']);
    });

    it('keeps the labels', () => {
        expect(menuLinks({ eventOpen: true, signedIn: true }).map((l) => l.text)).toEqual(['Kampa', 'Kampoppsett', 'Resultat', 'Toppliste', 'Trening', 'Storskjermen', 'Last ned']);
    });

    it.each(['/me', '/bracket', '/resultat', '/leaderboard', '/trening', '/last-ned'] as const)('marks %s as the open page and nothing else', (page) => {
        const marked = menuLinks({ eventOpen: true, signedIn: true, current: page }).filter((l) => l.current);
        expect(hrefs(marked)).toEqual([page]);
    });

    it('marks nothing without a current page', () => {
        expect(menuLinks({ eventOpen: true, signedIn: true }).some((l) => l.current)).toBe(false);
    });
});
