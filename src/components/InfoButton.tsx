'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './InfoButton.module.css';

/** The class of a label row with an i button: the label, the button, and the help text below them. */
export const INFO_ROW = styles.row;

/**
 * A small i button that shows or hides help text below it. The label names the help, such as
 * `Where to find the host` or `Om PIN-koden`. Escape hides it again while focus is on the button or inside the help
 * text, and focus goes back to the button. Put it next to a field label, not inside it.
 */
export function InfoButton({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const button = useRef<HTMLButtonElement>(null);
    const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        setOpen(false);
        button.current?.focus();
    };
    return (
        <>
            <button ref={button} type="button" className={styles.button} aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={closeOnEscape}>
                i
            </button>
            <div id={id} className={styles.text} tabIndex={-1} hidden={!open} onKeyDown={closeOnEscape}>
                {children}
            </div>
        </>
    );
}

/** A field label with an i button after it. The help text opens below them, above the input. */
export function InfoLabel({ htmlFor, className, text, info, children }: { htmlFor: string; className?: string; text: ReactNode; info: string; children: ReactNode }) {
    return (
        <div className={styles.row}>
            <label htmlFor={htmlFor} className={className}>
                {text}
            </label>
            <InfoButton label={info}>{children}</InfoButton>
        </div>
    );
}
