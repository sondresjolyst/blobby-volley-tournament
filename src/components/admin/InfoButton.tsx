'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * A small i button that shows or hides help text below it. The label names the help, such as
 * `Where to find the host`. Escape hides it again. Put it next to a field label, not inside it.
 */
export function InfoButton({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <>
            <button
                type="button"
                className="admin-info"
                aria-label={label}
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen(!open)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setOpen(false);
                }}
            >
                i
            </button>
            <div id={id} className="admin-info-text" hidden={!open}>
                {children}
            </div>
        </>
    );
}
