'use client';

import { signOut } from 'next-auth/react';
import { useState } from 'react';

export function SignOutButton() {
    const [pending, setPending] = useState(false);

    async function start() {
        setPending(true);
        try {
            await signOut({ callbackUrl: '/signin' });
        } catch {
            setPending(false);
        }
    }

    return (
        <button type="button" disabled={pending} aria-busy={pending} onClick={start}>
            Sign out
        </button>
    );
}
