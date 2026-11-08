import Link from 'next/link';
import { firewallCommand, serverHelp, startScripts } from '@/lib/game-server/commands';
import { CopyButton } from '../CopyButton';

const DOCKER = 'https://www.docker.com/products/docker-desktop/';
const DOCKER_ENGINE = 'https://docs.docker.com/engine/install/';

/**
 * Where the join links send the games of the players. `event` is the active event, whose game server
 * host the join links use.
 */
export function EventHost({ port, event }: { port: number; event: { id: number; serverHost?: string | null } | null }) {
    if (!event) return <p>There is no active event, so the join links have no game server address yet.</p>;
    if (!event.serverHost)
        return (
            <p>
                The active event has no game server host yet, so players get no join link. Set it on the <Link href={`/admin/events/${event.id}`}>event page</Link>.
            </p>
        );
    return (
        <p>
            The join links send the games of the players to <code>{`${event.serverHost}:${port}`}</code>. If the game server moves to another PC, change the host on the{' '}
            <Link href={`/admin/events/${event.id}`}>event page</Link>. If you change the port, start the game server container again with the new port.
        </p>
    );
}

/** What the PC at the LAN needs once before the game server can run on it. */
export function FirstTimeSetup({ port }: { port: number }) {
    const firewall = firewallCommand(port);
    return (
        <details>
            <summary>First time on this PC</summary>
            <ul>
                <li>
                    On Windows, install <a href={DOCKER}>Docker Desktop</a> and start it. Run the commands in PowerShell, or in WSL with the WSL integration of Docker Desktop. On
                    Linux, install <a href={DOCKER_ENGINE}>Docker Engine</a>. Check that <code>docker info</code> works.
                </li>
                <li>
                    On Windows, open UDP port {port} in the Windows firewall. Run this in PowerShell as administrator. This also applies with WSL, since Docker Desktop opens the port on
                    Windows. On Linux, Docker opens the port itself.
                    <p className="admin-command">
                        <code>{firewall}</code> <CopyButton text={firewall} label="Copy firewall command" noun="command" />
                    </p>
                </li>
                <li>Give the PC a fixed IP address on the LAN, for example with a reservation in the router. Use that address as the game server host of the event.</li>
            </ul>
        </details>
    );
}

/** The start scripts. The token shows here only right after it is made, for the start script to ask for. */
export function OtherWays({ token, siteUrl, port, image }: { token: string | null; siteUrl: string | null; port: number; image: string }) {
    return (
        <details>
            <summary>Other ways</summary>
            <h3>Start script</h3>
            <p>
                The start script asks for the site address, the token and the port once and remembers them. Then <code>update</code> gets the newest server without a new token, and{' '}
                <code>set-token</code> puts in a new token. Use it instead of the start command above.
            </p>
            <ul>
                {startScripts(image).map((script) => (
                    <li key={script.system}>
                        <a href={script.href}>Start script for {script.system}</a>
                        {[
                            { label: 'Download', key: 'download', command: script.download },
                            ...(script.image ? [{ label: 'Then, in the same window, set the server image of this site', key: 'image', command: script.image }] : []),
                            { label: 'Start', key: 'start', command: script.command },
                            { label: 'Update', key: 'update', command: script.update },
                            { label: 'New token', key: 'new token', command: script.setToken },
                        ].map(({ label, key, command }) => (
                            <p key={key} className="admin-command">
                                {label}: <code>{command}</code> <CopyButton text={command} label={`Copy ${script.system} ${key}`} noun="command" />
                            </p>
                        ))}
                    </li>
                ))}
            </ul>
            <p>Answers for the script:</p>
            <dl>
                <dt>Site address</dt>
                <dd>{siteUrl ? <code>{siteUrl}</code> : 'Not known, see above.'}</dd>
                <dt>Token</dt>
                <dd className="admin-command">
                    {token ? (
                        <>
                            <label>
                                Game server token <input type="text" readOnly value={token} size={50} autoComplete="off" spellCheck={false} />
                            </label>{' '}
                            <CopyButton text={token} label="Copy token" noun="token" />
                        </>
                    ) : (
                        'Shows here once, right after you make a token.'
                    )}
                </dd>
                <dt>Port</dt>
                <dd>{port}</dd>
            </dl>
        </details>
    );
}

/** The Docker commands for a game server that runs already. None of them holds the token. */
export function ManageServer({ image }: { image: string }) {
    return (
        <details>
            <summary>Stop, logs and update</summary>
            <ul>
                {serverHelp(image).map((help) => (
                    <li key={help.label}>
                        {help.label}: <code>{help.command}</code>
                    </li>
                ))}
            </ul>
            <p>To update, get the newest server, then make a new token and run the new start command. Remove the old game server first, as the command says.</p>
        </details>
    );
}
