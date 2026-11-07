import Link from 'next/link';
import type { ReactNode } from 'react';
import { EdgePizzas, HeaderPizzas } from '@/components/pizza/Decor';
import { Pizza } from '@/components/pizza/Pizza';
import p from '@/components/player/player.module.css';
import { foza } from '@/components/player/text';
import s from './site.module.css';

interface ShellProps {
    /** The name of the active event, or null when none is open. */
    eventName: string | null;
    /** The signed in player of the active event, or null. */
    player: { nickname: string; balance: number } | null;
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

/** The header and theme of the front page. It looks like the header of the player pages. */
export function SiteShell({ eventName, player, children }: ShellProps) {
    return (
        <div className={`${p.shell} ${s.site}`}>
            <EdgePizzas />
            <header className={p.header}>
                <HeaderPizzas />
                <div className={p.headerInner}>
                    <Link href="/" className={p.brand}>
                        <Pizza size={48} />
                        <span>{eventName ?? 'Blobby Volley'}</span>
                    </Link>
                    <nav aria-label="Hovudmeny" className={p.nav}>
                        {eventName && (
                            <Link href="/bracket" className={p.navLink}>
                                Kampoppsett
                            </Link>
                        )}
                        <Link href="/leaderboard" className={p.navLink}>
                            Toppliste
                        </Link>
                        {eventName && (
                            <Link href="/big" className={p.navLink}>
                                Storskjermen
                            </Link>
                        )}
                        {player ? (
                            <Link href="/me" className={`${p.wallet} ${s.walletLink}`}>
                                {player.nickname} · <Pizza size={22} />
                                {foza(player.balance)}
                            </Link>
                        ) : (
                            <>
                                <Link href="/login" className={p.navLink}>
                                    Logg inn
                                </Link>
                                {eventName && (
                                    <Link href="/join" className={s.navCta}>
                                        Bli med
                                    </Link>
                                )}
                            </>
                        )}
                    </nav>
                </div>
            </header>
            <main className={p.main}>{children}</main>
            <AdminLink />
        </div>
    );
}
