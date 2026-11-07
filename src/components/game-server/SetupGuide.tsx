import { firewallCommand, START_SCRIPTS } from '@/lib/game-server/commands';
import { CopyButton } from './CopyButton';

const DOCKER = 'https://www.docker.com/products/docker-desktop/';
const RELEASES = 'https://github.com/sondresjolyst/blobbyvolley2/releases';

/** The steps that start the game server on the computer at the LAN. The token form follows below it. */
export function SetupGuide({ siteUrl, port }: { siteUrl: string | null; port: number }) {
    const firewall = firewallCommand(port);
    return (
        <section aria-labelledby="setup">
            <h2 id="setup">Set up the game server</h2>
            <ol className="admin-steps">
                <li>
                    Install <a href={DOCKER}>Docker Desktop</a> and start it. On Linux, install Docker Engine.
                </li>
                <li>
                    Open UDP port {port} in the firewall. On Windows, run this in PowerShell as administrator.
                    <p>
                        <code>{firewall}</code> <CopyButton text={firewall} label="Copy firewall command" />
                    </p>
                </li>
                <li>Make a token below.</li>
                <li>
                    The easiest way is the start script. Download it and run it with <code>start</code>.
                    <ul>
                        {START_SCRIPTS.map((script) => (
                            <li key={script.system}>
                                <a href={script.href}>Start script for {script.system}</a>, then run this.
                                <p>
                                    <code>{script.command}</code> <CopyButton text={script.command} label={`Copy ${script.system} command`} />
                                </p>
                            </li>
                        ))}
                    </ul>
                    The script asks for the address of this site and the token.
                    {siteUrl ? (
                        <p>
                            <code>{siteUrl}</code> <CopyButton text={siteUrl} label="Copy site address" />
                        </p>
                    ) : (
                        <p>NEXTAUTH_URL is not set, so this page does not know the address of the site.</p>
                    )}
                    You can also run the one-line Docker command that shows after you make the token.
                </li>
                <li>Reload this page. Last used shows a time from the last few seconds once the game server talks to the site. Then players can join with the join link.</li>
                <li>
                    Players need the game itself. The Windows download is on the <a href={RELEASES}>releases page</a>.
                </li>
            </ol>
        </section>
    );
}
