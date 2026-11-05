import type { ReactNode } from 'react';

/** The column that the sign-in, denied and auth-error pages share. */
export function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <main>
            <h1>Blobby Volley Tournament</h1>
            {children}
        </main>
    );
}
