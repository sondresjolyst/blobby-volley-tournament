'use client';

import { useEffect, useState } from 'react';
import styles from './player.module.css';

type Copied = 'idle' | 'copied' | 'failed';

/** Copies with a hidden text field, for browsers without the clipboard API or without access to it. */
function copyBySelecting(text: string): boolean {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        field.remove();
    }
}

/** The main button of the join panel. It puts the join link on the clipboard and says so. */
export function CopyJoinLink({ link }: { link: string }) {
    const [copied, setCopied] = useState<Copied>('idle');

    useEffect(() => {
        if (copied === 'idle') return;
        const timer = setTimeout(() => setCopied('idle'), 4000);
        return () => clearTimeout(timer);
    }, [copied]);

    async function copy() {
        let ok = false;
        try {
            await navigator.clipboard.writeText(link);
            ok = true;
        } catch {
            ok = copyBySelecting(link);
        }
        setCopied(ok ? 'copied' : 'failed');
    }

    return (
        <div className={styles.copyRow}>
            <button type="button" className={styles.joinButton} onClick={copy}>
                Kopier lenkjå
            </button>
            <span aria-live="polite" className={styles.copyStatus}>
                {copied === 'copied' ? 'Kopiert!' : copied === 'failed' ? 'Fekk ikkje kopiert. Bruk lenkjå under eller skriv inn serveren og koden sjøl.' : ''}
            </span>
        </div>
    );
}
