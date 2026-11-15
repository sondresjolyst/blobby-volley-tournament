import type { HeaderLink } from './HeaderNav';

/** A page of the header menu that can be marked as the open one. */
export type MenuPage = '/me' | '/bracket' | '/leaderboard' | '/trening' | '/last-ned';

interface MenuOptions {
    /** True when an event is open. */
    eventOpen: boolean;
    /** True when a player of the active event is signed in. */
    signedIn: boolean;
    /** The page of the menu that is open, if it has a link there. */
    current?: MenuPage;
}

/** The links of the header menu, in the same order on every page. */
export function menuLinks({ eventOpen, signedIn, current }: MenuOptions): HeaderLink[] {
    const all: (HeaderLink & { shown: boolean })[] = [
        { href: '/me', text: 'Kampa', shown: eventOpen && signedIn },
        { href: '/bracket', text: 'Kampoppsett', shown: eventOpen },
        { href: '/leaderboard', text: 'Toppliste', shown: true },
        { href: '/trening', text: 'Trening', shown: eventOpen },
        { href: '/big', text: 'Storskjermen', shown: eventOpen },
        { href: '/last-ned', text: 'Last ned', shown: true },
    ];
    return all.filter((link) => link.shown).map(({ href, text }) => ({ href, text, current: href === current }));
}
