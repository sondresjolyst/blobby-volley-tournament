'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
    const [pending, setPending] = useState(false);

    async function start() {
        setPending(true);
        try {
            await signIn('github', { callbackUrl });
        } catch {
            setPending(false);
        }
    }

    return (
        <button type="button" disabled={pending} aria-busy={pending} onClick={start}>
            Sign in with GitHub
        </button>
    );
}
