import type { EventInput } from '@/lib/events/input';

const EVENT_ERRORS: Record<string, string> = {
    name: 'The name must be 1 to 100 characters.',
    dates: 'Give a valid start and end date. The end cannot be before the start.',
    code: 'The event code must be 8 to 32 letters A to Z, digits or hyphens.',
    foza: 'Foza amounts must be whole numbers from 0 to 1000000.',
    pin: 'The PIN must be 4 digits.',
    server: 'Give both a game server host and a port from 1 to 65535, or leave both empty. The host is a name or an IPv4 address.',
};

export function eventErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(EVENT_ERRORS, code) ? EVENT_ERRORS[code] : null;
}

/** The create and edit form. It posts to the admin API. */
export function EventForm({ action, event, submitLabel }: { action: string; event?: EventInput; submitLabel: string }) {
    return (
        <form method="post" action={action}>
            <p>
                <label>
                    Name <input name="name" required maxLength={100} defaultValue={event?.name} />
                </label>
            </p>
            <p>
                <label>
                    Start date <input name="startsOn" type="date" required defaultValue={event?.startsOn} />
                </label>
            </p>
            <p>
                <label>
                    End date <input name="endsOn" type="date" required defaultValue={event?.endsOn} />
                </label>
            </p>
            <p>
                <label>
                    Event code <input name="code" required minLength={8} maxLength={32} defaultValue={event?.code} />
                </label>
            </p>
            <p>
                <label>
                    Starting Foza <input name="startingFoza" type="number" min={0} max={1000000} step={1} required defaultValue={event?.startingFoza} />
                </label>
            </p>
            <p>
                <label>
                    Daily Foza <input name="dailyFoza" type="number" min={0} max={1000000} step={1} required defaultValue={event?.dailyFoza} />
                </label>
            </p>
            <p>
                <label>
                    Game server host <input name="serverHost" maxLength={253} defaultValue={event?.serverHost ?? ''} />
                </label>
            </p>
            <p>
                <label>
                    Game server port <input name="serverPort" type="number" min={1} max={65535} step={1} defaultValue={event?.serverPort ?? ''} />
                </label>
            </p>
            <p>Join links use this address. Leave both empty until the game server is set up.</p>
            <button type="submit">{submitLabel}</button>
        </form>
    );
}
