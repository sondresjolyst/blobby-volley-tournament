import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/site/AuthPage';
import s from '@/components/site/site.module.css';
import { GITHUB_SIGN_IN_FAILED_TITLE } from '@/lib/texts';

export default async function AuthError({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    const { error } = await searchParams;
    // A rejected account is sent to the denied page. Every other error is a failed sign-in.
    if (error === 'AccessDenied') redirect('/denied');
    return (
        <AuthPage title={GITHUB_SIGN_IN_FAILED_TITLE} adminLink={false}>
            <p className={s.authText}>Går det framleis ikkje, sjekk at du bruke rett GitHub-konto.</p>
            <p className={s.authSwitch}>
                <Link href="/login">Prøv igjen</Link>
            </p>
        </AuthPage>
    );
}
