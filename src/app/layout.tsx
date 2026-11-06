import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SponsorFooter } from '@/components/sponsors/SponsorFooter';
import { fontVariables } from './fonts';

export const metadata: Metadata = {
    title: 'Blobby Volley Tournament',
    description: 'Tournament and Foza betting site for Blobby Volley 2.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={fontVariables}>
            <body>
                {children}
                <SponsorFooter />
            </body>
        </html>
    );
}
