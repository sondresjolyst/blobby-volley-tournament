import { CopyButton } from '../CopyButton';

/** Messages for the `?error=` codes of the big screen key form. */
export function bigScreenErrorMessage(code: string | string[] | undefined): string | null {
    return code === 'bigScreenConfirm' ? 'Check the box to confirm the new big screen key.' : null;
}

/**
 * The big screen address of an event on /admin/events/[id], with the key, and a form that makes a
 * new key. The address only shows the join card while the event is active.
 */
export function BigScreenSection({ eventId, address, isActive }: { eventId: number; address: string; isActive: boolean }) {
    return (
        <section aria-labelledby="big-screen">
            <h2 id="big-screen">Big screen</h2>
            <p>
                Open this address on the TV. It shows the event code and the sign-up QR code{isActive ? '' : ' once this event is active'}. The key in the address is a secret, so only
                share it with whoever sets up the TV.
            </p>
            <p>
                <label>
                    Big screen address <input type="text" readOnly value={address} size={80} autoComplete="off" spellCheck={false} />
                </label>{' '}
                <CopyButton text={address} label="Copy address" noun="address" />
            </p>
            <form method="post" action={`/api/admin/events/${eventId}/big-screen-key`}>
                <label>
                    <input type="checkbox" name="confirm" value="yes" required /> The old address stops showing the join card
                </label>{' '}
                <button type="submit">New key</button>
            </form>
        </section>
    );
}
