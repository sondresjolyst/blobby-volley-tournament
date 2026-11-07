'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * A small i button that shows or hides help text below it. The label names the help, such as
 * `Where to find the host`. Escape hides it again while focus is on the button or inside the help
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
            <button ref={button} type="button" className="admin-info" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={closeOnEscape}>
                i
            </button>
            <div id={id} className="admin-info-text" tabIndex={-1} hidden={!open} onKeyDown={closeOnEscape}>
                {children}
            </div>
        </>
    );
}
