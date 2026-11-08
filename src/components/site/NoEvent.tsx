import Link from 'next/link';
import { NO_LAN, NO_LAN_OPEN } from '@/lib/texts';
import { AuthPage } from './AuthPage';
import s from './site.module.css';

/** What /join shows while no event is open. */
export function NoEvent() {
    return (
        <AuthPage title={NO_LAN}>
            <NoEventText />
        </AuthPage>
    );
}

/** The way in for an admin while no event is open. */
export function AdminWayIn() {
    return (
        <>
            E du admin? <Link href="/admin">Gå te admin</Link> og opne eit LAN.
        </>
    );
}

/** Why nobody can sign up yet, and the way in for an admin. */
export function NoEventText() {
    return (
        <p className={s.authText}>
            {NO_LAN_OPEN} <AdminWayIn />
        </p>
    );
}
