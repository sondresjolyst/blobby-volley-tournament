import Link from 'next/link';
import type { ReactNode } from 'react';
import { EdgePizzas } from '@/components/pizza/Decor';
import { HeaderNav, type HeaderLink } from '@/components/player/HeaderNav';
import p from '@/components/player/player.module.css';
import s from './site.module.css';

interface ShellProps {
    /** The name of the active event, or null when none is open. */
    eventName: string | null;
    /** The signed in player of the active event, or null. */
    player: { nickname: string; balance: number } | null;
    /** The page of the menu that is open, if it has a link there. */
    current?: '/leaderboard' | '/last-ned';
    children: ReactNode;
}

/** The small link to the admin pages at the bottom of the public pages. */
export function AdminLink() {
    return (
        <p className={s.adminLink}>
            <Link href="/admin">Admin</Link>
        </p>
    );
}

/** The header and theme of the front page and the leaderboards. The header is the one of the player pages. */
export function SiteShell({ eventName, player, current, children }: ShellProps) {
    const links: HeaderLink[] = [
        ...(eventName ? [{ href: '/bracket', text: 'Kampoppsett' }] : []),
        { href: '/leaderboard', text: 'Toppliste', current: current === '/leaderboard' },
        ...(eventName ? [{ href: '/big', text: 'Storskjermen' }] : []),
        { href: '/last-ned', text: 'Last ned', current: current === '/last-ned' },
    ];
    return (
        <div className={`${p.shell} ${s.site}`}>
            <EdgePizzas />
            <HeaderNav home="/" eventName={eventName} label="Hovudmeny" links={links} player={player} />
            <main className={p.main}>{children}</main>
            <AdminLink />
        </div>
    );
}
