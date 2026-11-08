'use client';

import { useEffect, useState } from 'react';
import { copyText } from './copy';

type Copied = 'idle' | 'copied' | 'failed';

/**
 * A button that puts a text on the clipboard and says so. The noun names what is copied, such as
 * `address` or `command`, in the message shown when the copy fails.
 */
export function CopyButton({ text, label, noun = 'text' }: { text: string; label: string; noun?: string }) {
    const [copied, setCopied] = useState<Copied>('idle');

    useEffect(() => {
        if (copied === 'idle') return;
        const timer = setTimeout(() => setCopied('idle'), 4000);
        return () => clearTimeout(timer);
    }, [copied]);

    async function copy() {
        setCopied((await copyText(text)) ? 'copied' : 'failed');
    }

    return (
        <>
            <button type="button" onClick={copy}>
                {label}
            </button>{' '}
            <span aria-live="polite">{copied === 'copied' ? 'Copied.' : copied === 'failed' ? `Could not copy. Select the ${noun} and copy it by hand.` : ''}</span>
        </>
    );
}
