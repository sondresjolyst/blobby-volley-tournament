import Link from 'next/link';
import type { ReactNode } from 'react';
import { EdgePizzas, HeaderPizzas } from '@/components/pizza/Decor';
import { Pizza } from '@/components/pizza/Pizza';
import styles from './player.module.css';
import { foza } from './text';

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
    const current = (p: PlayerPage) => (p === page ? ('page' as const) : undefined);
    return (
        <div className={styles.shell} lang="nn">
            <EdgePizzas />
            <header className={styles.header}>
                <HeaderPizzas />
                <div className={styles.headerInner}>
                    <Link href="/me" className={styles.brand}>
                        <Pizza size={48} />
                        <span>{eventName}</span>
                    </Link>
                    <nav aria-label="Spelarsidå" className={styles.nav}>
                        <Link href="/me" className={styles.navLink} aria-current={current('matches')}>
                            Kampar
                        </Link>
                        <Link href="/bracket" className={styles.navLink} aria-current={current('bracket')}>
                            Kampoppsett
                        </Link>
                        <span className={styles.wallet}>
                            {nickname} · <Pizza size={22} />
                            {foza(balance)}
                        </span>
                        <form method="post" action="/api/player/signout">
                            <button type="submit" className={styles.signOut}>
                                Logg ut
                            </button>
                        </form>
                    </nav>
                </div>
            </header>
            <main className={styles.main}>{children}</main>
        </div>
    );
}
