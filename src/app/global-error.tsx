'use client';

import { ErrorPage } from '@/components/site/ErrorPage';
import { fontVariables } from './fonts';

/** Shown when the layout itself broke, so it brings its own html and body. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="nn" className={fontVariables}>
            <body>
                <ErrorPage reset={reset} />
            </body>
        </html>
    );
}
