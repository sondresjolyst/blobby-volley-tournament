import Link from 'next/link';
import { AuthPage } from './AuthPage';
import s from './site.module.css';

/** What /join shows while no event is open. */
export function NoEvent() {
    return (
        <AuthPage title="Ingen LAN e i gang">
            <NoEventText />
        </AuthPage>
    );
}

/** Why nobody can sign up yet, and the way in for an admin. */
export function NoEventText() {
    return (
        <p className={s.authText}>
            Ingen LAN e opent akkurat no. Ein admin må opna eit LAN før någen kan bli med eller logga inn. E du admin? <Link href="/admin">Gå te admin</Link> og opne eit LAN.
        </p>
    );
}
