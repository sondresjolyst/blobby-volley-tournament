import Link from 'next/link';
import { AuthPage } from './AuthPage';
import s from './site.module.css';
import { BACK_HOME, ERROR_TITLE } from '@/lib/texts';

/** What a broken page shows, with a button that tries the page again. */
export function ErrorPage({ reset }: { reset: () => void }) {
    return (
        <AuthPage title={ERROR_TITLE} adminLink={false}>
            <button type="button" className={s.authSubmit} onClick={reset}>
                Prøv igjen
            </button>
            <p className={s.authSwitch}>
                <Link href="/">{BACK_HOME}</Link>
            </p>
        </AuthPage>
    );
}
