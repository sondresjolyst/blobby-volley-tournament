import { MAX_SCREEN_SECONDS, MIN_SCREEN_SECONDS, SCREEN_TYPES, type ScreenRotation, type ScreenType } from '@/lib/big-screen/screens';
import { CopyButton } from '../CopyButton';

/** Messages for the `?error=` codes of the big screen forms. */
export function bigScreenErrorMessage(code: string | string[] | undefined): string | null {
    switch (code) {
        case 'bigScreenConfirm':
            return 'Check the box to confirm the new big screen key.';
        case 'bigScreenNone':
            return 'Turn on at least one screen for the big screen.';
        case 'bigScreenSeconds':
            return `The time on each screen must be a whole number of seconds from ${MIN_SCREEN_SECONDS} to ${MAX_SCREEN_SECONDS}.`;
        default:
            return null;
    }
}

/** The name and the content of each screen, as the admin page lists them. */
export const SCREEN_INFO: Record<ScreenType, { name: string; shows: string }> = {
    overview: { name: 'Overview', shows: 'The match on the floor, the next matches, part of the bracket, the leaderboards and the join card.' },
    bracket: { name: 'Bracket', shows: 'Every round of the bracket, large.' },
    foza: { name: 'Foza', shows: 'The bettors with the most Foza won and the biggest single wins.' },
    next: { name: 'Up next', shows: 'The matches on the floor with their live score, then the next ones in order.' },
    stats: { name: 'Stats', shows: 'Records such as the most wins, the biggest win and the longest match. Records with nothing to show are left out.' },
    sponsors: { name: 'Sponsors', shows: 'Every sponsor logo, full screen.' },
    winner: { name: 'Winner', shows: 'The champion and the final. Only once a tournament has a winner.' },
};

/** The screens of the rotation first, in their order, then the rest. */
export function screenRows(rotation: ScreenRotation): { type: ScreenType; shown: boolean; order: number }[] {
    const rest = SCREEN_TYPES.filter((type) => !rotation.screens.includes(type));
    return [...rotation.screens, ...rest].map((type, i) => ({ type, shown: rotation.screens.includes(type), order: i + 1 }));
}

/** The form that picks the screens the big screen takes turns on, their order and the time on each. */
function RotationForm({ eventId, rotation }: { eventId: number; rotation: ScreenRotation }) {
    return (
        <>
            <h3 id="big-screen-rotation">Screens</h3>
            <p>
                The big screen takes turns on the screens that are on, in order. With one screen on, it stays there. A screen with nothing to show yet is skipped. Changes reach an
                open big screen within a few seconds, without a reload. To keep one TV on one screen whatever the turns are, add <code>&amp;screen=</code> and the code of the screen to its
                address, such as <code>&amp;screen=bracket</code>.
            </p>
            <form method="post" action={`/api/admin/events/${eventId}/big-screen-rotation`}>
                <div className="admin-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Screen</th>
                                <th>On</th>
                                <th>Order</th>
                                <th>Shows</th>
                            </tr>
                        </thead>
                        <tbody>
                            {screenRows(rotation).map(({ type, shown, order }) => (
                                <tr key={type}>
                                    <td data-label="Screen">
                                        {SCREEN_INFO[type].name} <code>{type}</code>
                                    </td>
                                    <td data-label="On">
                                        <label>
                                            <input type="checkbox" name={`show_${type}`} defaultChecked={shown} /> Use the {SCREEN_INFO[type].name} screen
                                        </label>
                                    </td>
                                    <td data-label="Order">
                                        <label>
                                            Order of the {SCREEN_INFO[type].name} screen{' '}
                                            <input type="number" name={`order_${type}`} min={1} max={SCREEN_TYPES.length} step={1} defaultValue={order} required />
                                        </label>
                                    </td>
                                    <td data-label="Shows">{SCREEN_INFO[type].shows}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p>
                    <label>
                        Seconds on each screen{' '}
                        <input type="number" name="seconds" min={MIN_SCREEN_SECONDS} max={MAX_SCREEN_SECONDS} step={1} defaultValue={rotation.seconds} required />
                    </label>{' '}
                    <button type="submit">Set screens</button>
                </p>
            </form>
        </>
    );
}

/**
 * The big screen address of an event on /admin/events/[id], with the key, a form that makes a new
 * key, and the screens it takes turns on. The address only shows the join card while the event is active.
 */
export function BigScreenSection({ eventId, address, isActive, rotation }: { eventId: number; address: string; isActive: boolean; rotation: ScreenRotation }) {
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
            <RotationForm eventId={eventId} rotation={rotation} />
        </section>
    );
}
