'use client';

import { signOut } from 'next-auth/react';
import { useState } from 'react';

export function SignOutButton({ className }: { className?: string }) {
    const [pending, setPending] = useState(false);

    async function start() {
        setPending(true);
        try {
            await signOut({ callbackUrl: '/login' });
        } catch {
            setPending(false);
        }
    }

    return (
        <button type="button" className={className} disabled={pending} aria-busy={pending} onClick={start}>
            Sign out
        </button>
    );
}
