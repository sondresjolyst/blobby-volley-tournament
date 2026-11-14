import Link from 'next/link';
import { AuthPage } from '@/components/site/AuthPage';
import s from '@/components/site/site.module.css';
import { BACK_HOME, NOT_FOUND_TITLE } from '@/lib/texts';

export default function NotFound() {
    return (
        <AuthPage title={NOT_FOUND_TITLE} adminLink={false}>
            <p className={s.authText}>Sjekk at adressen e rett.</p>
            <p className={s.authSwitch}>
                <Link href="/">{BACK_HOME}</Link>
            </p>
        </AuthPage>
    );
}
