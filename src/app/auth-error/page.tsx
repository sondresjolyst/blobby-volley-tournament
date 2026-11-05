import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthLayout } from '@/components/auth/AuthLayout';

export default async function AuthError({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    const { error } = await searchParams;
    // A rejected account is sent to the denied page. Every other error is a failed sign-in.
    if (error === 'AccessDenied') redirect('/denied');
    return (
        <AuthLayout>
            <p>Sign-in failed.</p>
            <Link href="/signin">Try again</Link>
        </AuthLayout>
    );
}
