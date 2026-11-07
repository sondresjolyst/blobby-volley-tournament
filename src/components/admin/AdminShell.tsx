import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { bigScreenHref } from '@/lib/big-screen/key';
import { getPool } from '@/lib/db';
import { getActiveBigScreenKey, getActiveEvent } from '@/lib/store/events';
import styles from './admin.module.css';

export type AdminSection = 'home' | 'events' | 'tournaments' | 'matches' | 'game-server';

const LINKS: { section: AdminSection; href: string; label: string }[] = [
    { section: 'home', href: '/admin', label: 'Overview' },
    { section: 'events', href: '/admin/events', label: 'Events' },
    { section: 'tournaments', href: '/admin/tournaments', label: 'Tournaments' },
    { section: 'matches', href: '/admin/matches', label: 'Matches' },
    { section: 'game-server', href: '/admin/game-server', label: 'Game server' },
];

/**
 * The menu and theme of every admin page. Pages call requireAdmin before they render this, so it
 * only reads the database for an admin. The admin pages are in English.
 */
export async function AdminShell({ section, children }: { section: AdminSection; children: ReactNode }) {
    const pool = getPool();
    const [event, key] = await Promise.all([getActiveEvent(pool), getActiveBigScreenKey(pool)]);
    return (
        <div className={styles.admin} lang="en">
            <nav aria-label="Admin" className={styles.side}>
                <span className={styles.brand}>{event ? `${event.name} admin` : 'Blobby admin'}</span>
                <ul className={styles.links}>
                    {LINKS.map((link) => (
                        <li key={link.section}>
                            <Link href={link.href} className={styles.link} aria-current={link.section === section ? 'page' : undefined}>
                                {link.label}
                            </Link>
                        </li>
                    ))}
                    <li>
                        {/* The link carries the key of the active event, so the TV shows the join card. */}
                        <Link href={bigScreenHref(key)} className={styles.link}>
                            Big screen
                        </Link>
                    </li>
                </ul>
                <div className={styles.sideFoot}>
                    <Link href="/" className={styles.siteLink}>
                        To the site
                    </Link>
                    <SignOutButton className={styles.signOut} />
                </div>
            </nav>
            <main className={styles.main}>{children}</main>
        </div>
    );
}
