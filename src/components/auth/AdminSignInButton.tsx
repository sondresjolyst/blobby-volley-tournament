'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

/** Starts the GitHub sign-in of an admin. The player session is not touched. */
export function AdminSignInButton({ callbackUrl, className }: { callbackUrl: string; className?: string }) {
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
        <button type="button" className={className} disabled={pending} aria-busy={pending} onClick={start}>
            Admin? Logg inn med GitHub
        </button>
    );
}
