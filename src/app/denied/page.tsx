import Link from 'next/link';
import { AuthPage } from '@/components/site/AuthPage';
import s from '@/components/site/site.module.css';

export default function Denied() {
    return (
        <AuthPage title="Ikkje tilgang" adminLink={false}>
            <p className={s.authText}>Den GitHub-kontoen har ikkje tilgang te admin. Logg inn med ein annan GitHub-konto.</p>
            <p className={s.authSwitch}>
                <Link href="/login">Tebake te innloggingå</Link>
            </p>
        </AuthPage>
    );
}
