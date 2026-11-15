import type { ReactNode } from 'react';
import { EdgePizzas } from '@/components/pizza/Decor';
import { HeaderNav } from './HeaderNav';
import { menuLinks, type MenuPage } from './menu';
import styles from './player.module.css';

export type PlayerPage = 'matches' | 'bracket' | 'training';

const PAGE_PATHS: Record<PlayerPage, MenuPage> = { matches: '/me', bracket: '/bracket', training: '/trening' };

interface ShellProps {
    page: PlayerPage;
    eventName: string;
    nickname: string;
    balance: number;
    children: ReactNode;
}

/** The header, the theme and the main area that every player page shares. */
export function PlayerShell({ page, eventName, nickname, balance, children }: ShellProps) {
    const links = menuLinks({ eventOpen: true, signedIn: true, current: PAGE_PATHS[page] });
    return (
        <div className={styles.shell} lang="nn">
            <EdgePizzas />
            <HeaderNav home="/me" eventName={eventName} label="Spelarsidå" links={links} player={{ nickname, balance }} />
            <main className={styles.main}>{children}</main>
        </div>
    );
}
