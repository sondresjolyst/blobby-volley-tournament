'use client';

import { useRef, useState } from 'react';

/**
 * Opens and closes a part in place, such as an edit form or a confirm step. Closing gives the focus
 * back to the button that opened it.
 */
export function useOpenClose() {
    const [isOpen, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    return {
        isOpen,
        trigger,
        open: () => setOpen(true),
        close: () => {
            setOpen(false);
            // The button is back after the render, so focus waits a frame.
            requestAnimationFrame(() => trigger.current?.focus());
        },
    };
}

/** The confirm step of a delete or remove. The yes button posts to `action` and takes the focus. */
export function ConfirmBox({ action, label, question, yes, onCancel }: { action: string; label: string; question: string; yes: string; onCancel: () => void }) {
    return (
        <form method="post" action={action} className="admin-confirm" role="group" aria-label={label}>
            <span>{question}</span>
            {/* The admin asked for this button, so it takes the focus. */}
            <button type="submit" autoFocus>
                {yes}
            </button>
            <button type="button" className="admin-quiet" onClick={onCancel}>
                Cancel
            </button>
        </form>
    );
}
