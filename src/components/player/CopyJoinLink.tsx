'use client';

import { useEffect, useState } from 'react';
import { copyText } from '../copy';
import styles from './player.module.css';

type Copied = 'idle' | 'copied' | 'failed';

/** The main button of the join panel. It puts the join link on the clipboard and says so. */
export function CopyJoinLink({ link }: { link: string }) {
    const [copied, setCopied] = useState<Copied>('idle');

    useEffect(() => {
        if (copied === 'idle') return;
        const timer = setTimeout(() => setCopied('idle'), 4000);
        return () => clearTimeout(timer);
    }, [copied]);

    async function copy() {
        setCopied((await copyText(link)) ? 'copied' : 'failed');
    }

    return (
        <div className={styles.copyRow}>
            <button type="button" className={styles.joinButton} onClick={copy}>
                Kopier lenkjå
            </button>
            <span aria-live="polite" className={styles.copyStatus}>
                {copied === 'copied' ? 'Kopiert!' : copied === 'failed' ? 'Fekk ikkje kopiert. Bruk lenkjå under eller skriv inn serveren og koden din sjøl.' : ''}
            </span>
        </div>
    );
}
