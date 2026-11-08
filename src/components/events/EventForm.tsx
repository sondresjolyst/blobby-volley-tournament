import { InfoButton } from '@/components/InfoButton';
import { NAME_LENGTH_ERROR } from '@/lib/admin-texts';
import type { EventInput } from '@/lib/events/input';
import { MAX_FOZA } from '@/lib/foza';
import { CONTAINER_PORT } from '@/lib/game-server/commands';
import { EventCodeField } from './EventCodeField';

const EVENT_ERRORS: Record<string, string> = {
    name: NAME_LENGTH_ERROR,
    dates: 'Enter a start date and an end date. The end date cannot be before the start date.',
    code: 'The event code must be 8 to 32 letters A to Z, digits or hyphens.',
    'code-taken': 'Another event already has this event code. Select Generate for a new one.',
    foza: `Foza amounts must be whole numbers from 0 to ${MAX_FOZA}.`,
    pin: 'The new PIN must be 4 digits.',
    server: `Enter a game server host, or leave the host and the port empty. An empty port uses port ${CONTAINER_PORT}. The port must be from 1 to 65535.`,
    'server-host':
        'The game server host must be the LAN address of the PC that runs the game server, as four numbers such as 192.168.1.50 or as a name on the LAN. It cannot be localhost, 127.0.0.1 or a web address with http://.',
};

export function eventErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(EVENT_ERRORS, code) ? EVENT_ERRORS[code] : null;
}

/**
 * The create and edit form. It posts to the admin API. A new event gets `suggestedCode` in the
 * code field until the admin types a name.
 */
export function EventForm({ action, event, submitLabel, suggestedCode = '' }: { action: string; event?: EventInput; submitLabel: string; suggestedCode?: string }) {
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
            <EventCodeField initial={event?.code ?? suggestedCode} followName={!event} />
            <p>Players enter this code to join. The big screen shows it next to the QR code.</p>
            <p>
                <label>
                    Starting Foza <input name="startingFoza" type="number" min={0} max={MAX_FOZA} step={1} required defaultValue={event?.startingFoza} />
                </label>
            </p>
            <p>
                <label>
                    Daily Foza <input name="dailyFoza" type="number" min={0} max={MAX_FOZA} step={1} required defaultValue={event?.dailyFoza} />
                </label>
            </p>
            <p className="admin-hint">Each player gets this once a day, from the day after they join.</p>
            <div className="admin-field">
                <div className="admin-field-label">
                    <label htmlFor="serverHost">Game server host</label>
                    <InfoButton label="Where to find the host" textId="serverHost-help">
                        <p>
                            The address that the games of the players connect to. It is the LAN IP address of the PC that runs the game server in Docker, for example 192.168.1.50. Find it
                            with ipconfig on Windows or ip addr on Linux.
                        </p>
                        <p>Not localhost or 127.0.0.1, and not the address of this website.</p>
                        <p>
                            Leave the port empty to use {CONTAINER_PORT}, the port the start command uses. If you change the port, start the game server container again with the new
                            port.
                        </p>
                        <p>Tip: give that PC a fixed IP address in the router, and allow UDP port {CONTAINER_PORT} in its firewall. The Game server page has the firewall command.</p>
                        <p>After you change the host or the port, players who are already connected stay on the old server. They must use the new join link or join again.</p>
                    </InfoButton>
                </div>
                <input id="serverHost" name="serverHost" aria-describedby="serverHost-help" maxLength={253} autoComplete="off" spellCheck={false} placeholder="192.168.1.50" defaultValue={event?.serverHost ?? ''} />
            </div>
            <p>
                <label>
                    Game server port <input name="serverPort" type="number" min={1} max={65535} step={1} placeholder={String(CONTAINER_PORT)} defaultValue={event?.serverPort ?? ''} />
                </label>
            </p>
            <p>The join links and the server address on the match page of a player use this host and port. Leave both empty until the game server is set up.</p>
            <button type="submit">{submitLabel}</button>
        </form>
    );
}
