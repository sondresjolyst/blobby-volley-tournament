import Link from 'next/link';
import { firewallCommand, START_SCRIPTS } from '@/lib/game-server/commands';
import { CopyButton } from '../CopyButton';

const DOCKER = 'https://www.docker.com/products/docker-desktop/';
const RELEASES = 'https://github.com/sondresjolyst/blobbyvolley2/releases/latest';

/**
 * The steps that start the game server on the computer at the LAN. The token form follows below it.
 * `event` is the active event, whose game server host the join links use.
 */
export function SetupGuide({ siteUrl, port, event }: { siteUrl: string | null; port: number; event: { id: number; serverHost?: string | null } | null }) {
    const firewall = firewallCommand(port);
    return (
        <section aria-labelledby="setup">
            <h2 id="setup">Set up the game server</h2>
            {!event ? (
                <p>There is no active event, so the join links have no game server address yet.</p>
            ) : event.serverHost ? (
                <p>
                    The join links send the games of the players to <code>{`${event.serverHost}:${port}`}</code>. If the game server moves to another PC, change the host on the{' '}
                    <Link href={`/admin/events/${event.id}`}>event page</Link>. If you change the port, start the game server container again with the new port.
                </p>
            ) : (
                <p>
                    The active event has no game server host yet, so players get no join link. Set it on the <Link href={`/admin/events/${event.id}`}>event page</Link>.
                </p>
            )}
            <ol className="admin-steps">
                <li>
                    Install <a href={DOCKER}>Docker Desktop</a> and start it. On Linux, install Docker Engine.
                </li>
                <li>
                    Open UDP port {port} in the firewall. On Windows, run this in PowerShell as administrator.
                    <p>
                        <code>{firewall}</code> <CopyButton text={firewall} label="Copy firewall command" noun="command" />
                    </p>
                </li>
                <li>Make a token below.</li>
                <li>
                    The easiest way is the start script. It keeps the token off the command line and remembers it, so updates need no new token. Download it and run it with{' '}
                    <code>start</code>.
                    <ul>
                        {START_SCRIPTS.map((script) => (
                            <li key={script.system}>
                                <a href={script.href}>Start script for {script.system}</a>. Download it here or with this command.
                                <p>
                                    <code>{script.download}</code> <CopyButton text={script.download} label={`Copy ${script.system} download`} noun="command" />
                                </p>
                                Then start it.
                                <p>
                                    <code>{script.command}</code> <CopyButton text={script.command} label={`Copy ${script.system} command`} noun="command" />
                                </p>
                            </li>
                        ))}
                    </ul>
                    The script asks for the address of this site and the token.
                    {siteUrl ? (
                        <p>
                            <code>{siteUrl}</code> <CopyButton text={siteUrl} label="Copy site address" noun="address" />
                        </p>
                    ) : (
                        <p>NEXTAUTH_URL is not set, so this page does not know the address of the site.</p>
                    )}
                    The alternative is the one-line Docker command that shows after you make the token.
                </li>
                <li>Watch the health line on this page. It turns green within a few seconds once the game server talks to the site. Then players can join with the join link.</li>
                <li>
                    Players need the game itself. The Windows download is in the <a href={RELEASES}>latest release</a>.
                </li>
            </ol>
        </section>
    );
}
