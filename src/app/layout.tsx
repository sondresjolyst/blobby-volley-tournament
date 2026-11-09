import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StayOnSubmit } from '@/components/forms/StayOnSubmit';
import { SponsorFooter } from '@/components/sponsors/SponsorFooter';
import { fontVariables } from './fonts';

export const metadata: Metadata = {
    title: 'Blobby Volley Tournament',
    description: 'Turnering og Foza-spel for Blobby Volley 2.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="nn" className={fontVariables}>
            <body>
                <StayOnSubmit>{children}</StayOnSubmit>
                <SponsorFooter />
            </body>
        </html>
    );
}
