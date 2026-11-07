import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthPizzas } from '@/components/pizza/Decor';
import { Pizza } from '@/components/pizza/Pizza';
import p from '@/components/player/player.module.css';
import { AdminLink } from './SiteShell';
import s from './site.module.css';

/** The red page of sign-up, sign-in and the admin sign-in errors, with one column in the middle. */
export function AuthPage({ title, intro, adminLink = true, children }: { title: string; intro?: ReactNode; adminLink?: boolean; children: ReactNode }) {
    return (
        <div className={`${p.shell} ${s.site} ${s.auth}`}>
            <AuthPizzas />
            <main className={s.authMain}>
                <div className={s.authHead}>
                    <Link href="/" className={s.authHome} aria-label="Framsidå">
                        <Pizza size={88} />
                    </Link>
                    <h1 className={s.authTitle}>{title}</h1>
                    {intro && <p className={s.authIntro}>{intro}</p>}
                </div>
                {children}
            </main>
            {adminLink && <AdminLink />}
        </div>
    );
}
