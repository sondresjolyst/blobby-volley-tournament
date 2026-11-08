import type { ReactNode } from 'react';
import { EdgePizzas } from '@/components/pizza/Decor';
import { HeaderNav } from './HeaderNav';
import styles from './player.module.css';

export type PlayerPage = 'matches' | 'bracket';

interface ShellProps {
    page: PlayerPage;
    eventName: string;
    nickname: string;
    balance: number;
    children: ReactNode;
}

/** The header, the theme and the main area that every player page shares. */
export function PlayerShell({ page, eventName, nickname, balance, children }: ShellProps) {
    const links = [
        { href: '/me', text: 'Kampa', current: page === 'matches' },
        { href: '/bracket', text: 'Kampoppsett', current: page === 'bracket' },
        { href: '/leaderboard', text: 'Toppliste' },
    ];
    return (
        <div className={styles.shell} lang="nn">
            <EdgePizzas />
            <HeaderNav home="/me" eventName={eventName} label="Spelarsidå" links={links} player={{ nickname, balance }} />
            <main className={styles.main}>{children}</main>
        </div>
    );
}
