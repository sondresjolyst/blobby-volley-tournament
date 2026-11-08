import Link from 'next/link';
import { HeaderPizzas } from '@/components/pizza/Decor';
import { Pizza } from '@/components/pizza/Pizza';
import styles from './player.module.css';
import { SignOutButton } from './SignOutButton';
import { foza } from './text';

export interface HeaderLink {
    href: string;
    text: string;
    /** True on the page the link points to. */
    current?: boolean;
}

interface HeaderNavProps {
    /** Where the brand goes. */
    home: string;
    /** The name of the active event, or null when none is open. */
    eventName: string | null;
    /** The name of the menu for screen readers. */
    label: string;
    links: readonly HeaderLink[];
    /** The signed in player, who gets the wallet and Logg ut. Without one, Logg inn and Bli med show. */
    player: { nickname: string; balance: number } | null;
}

/** The header of the front page and the player pages: the brand, the menu, and the wallet or the way in. */
export function HeaderNav({ home, eventName, label, links, player }: HeaderNavProps) {
    return (
        <header className={styles.header}>
            <HeaderPizzas />
            <div className={styles.headerInner}>
                <Link href={home} className={styles.brand}>
                    <Pizza size={48} />
                    <span>{eventName ?? 'Blobby Volley'}</span>
                </Link>
                <nav aria-label={label} className={styles.nav}>
                    {links.map((link) => (
                        <Link key={link.href} href={link.href} className={styles.navLink} aria-current={link.current ? 'page' : undefined}>
                            {link.text}
                        </Link>
                    ))}
                    {player ? (
                        <>
                            <Link href="/me" className={`${styles.wallet} ${styles.walletLink}`}>
                                {player.nickname} · <Pizza size={22} />
                                {foza(player.balance)}
                            </Link>
                            <SignOutButton />
                        </>
                    ) : (
                        <>
                            <Link href="/login" className={styles.navLink}>
                                Logg inn
                            </Link>
                            {eventName && (
                                <Link href="/join" className={styles.navCta}>
                                    Bli med
                                </Link>
                            )}
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
}
