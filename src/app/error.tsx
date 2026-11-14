'use client';

import { ErrorPage } from '@/components/site/ErrorPage';

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <ErrorPage reset={reset} />;
}
