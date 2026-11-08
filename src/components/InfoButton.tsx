'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './InfoButton.module.css';

/** The id of the help text of the field with this id, such as `pin-help`. The input points at it with aria-describedby. */
const helpId = (fieldId: string) => `${fieldId}-help`;

/**
 * A small i button that shows or hides help text below it. The label names the help, such as
 * `Where to find the host` or `Ka e PIN-en te?`. Escape hides it again while focus is on the button
 * or inside the help text, and focus goes back to the button. Put it next to a field label, not
 * inside it. InfoLabel names the help text `<field id>-help`, so the input can point at it.
 */
export function InfoButton({ label, textId, children }: { label: string; textId?: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const ownId = useId();
    const id = textId ?? ownId;
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

/** A field label with an i button after it. The help text opens below them, above the input, with the id from helpId. */
export function InfoLabel({ htmlFor, className, text, info, children }: { htmlFor: string; className?: string; text: ReactNode; info: string; children: ReactNode }) {
    return (
        <div className={styles.row}>
            <label htmlFor={htmlFor} className={className}>
                {text}
            </label>
            <InfoButton label={info} textId={helpId(htmlFor)}>
                {children}
            </InfoButton>
        </div>
    );
}
