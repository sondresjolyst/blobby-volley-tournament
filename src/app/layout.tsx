import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SponsorFooter } from '@/components/sponsors/SponsorFooter';

export const metadata: Metadata = {
    title: 'Blobby Volley Tournament',
    description: 'Tournament and Foza betting site for Blobby Volley 2.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                {children}
                <SponsorFooter />
            </body>
        </html>
    );
}
