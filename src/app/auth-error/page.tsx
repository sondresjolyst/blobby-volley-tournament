import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/site/AuthPage';
import s from '@/components/site/site.module.css';

export default async function AuthError({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    const { error } = await searchParams;
    // A rejected account is sent to the denied page. Every other error is a failed sign-in.
    if (error === 'AccessDenied') redirect('/denied');
    return (
        <AuthPage title="Det gjekk ikkje" adminLink={false}>
            <p className={s.authText}>Innloggingå med GitHub gjekk ikkje.</p>
            <p className={s.authSwitch}>
                <Link href="/login">Prøv igjen</Link>
            </p>
        </AuthPage>
    );
}
