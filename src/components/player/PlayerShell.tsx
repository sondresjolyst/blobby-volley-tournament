import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './player.module.css';
import { foza } from './text';

/** A plain pizza with pepperoni. It is drawn here, so no outside artwork is used. */
export function Pizza({ size, className }: { size: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" className={className}>
            <circle cx="48" cy="48" r="44" fill="#F6C445" stroke="#8A4B1E" strokeWidth="6" />
            <circle cx="34" cy="36" r="7" fill="#A82A1A" />
            <circle cx="60" cy="32" r="6" fill="#A82A1A" />
            <circle cx="58" cy="60" r="8" fill="#A82A1A" />
            <circle cx="32" cy="62" r="5" fill="#A82A1A" />
            <path d="M44 46 l4 -3 l3 4" stroke="#3E7A2F" strokeWidth="3" fill="none" />
        </svg>
    );
}

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
            <header className={styles.header}>
                <Pizza size={220} className={styles.headerPizza} />
                <Pizza size={120} className={styles.headerPizzaSmall} />
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
