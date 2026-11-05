import { AuthLayout } from '@/components/auth/AuthLayout';
import { safeCallback } from '@/lib/auth/gate';
import { SignInButton } from './sign-in-button';

export default async function SignIn({ searchParams }: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
    const { callbackUrl } = await searchParams;
    return (
        <AuthLayout>
            <p>Admin sign-in.</p>
            <SignInButton callbackUrl={safeCallback(callbackUrl)} />
        </AuthLayout>
    );
}
