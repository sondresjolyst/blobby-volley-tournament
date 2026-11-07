// The Docker commands that start the game server for the site. The variable names are the ones
// the game server reads in tournament mode.

export const SERVER_IMAGE = 'sondresjo/blobby-server:latest';
export const SERVER_CONTAINER = 'blobby-server';
/** The UDP port the game server listens on inside the container. */
export const CONTAINER_PORT = 1234;

export type Shell = 'powershell' | 'bash';

const PLAIN = /^[A-Za-z0-9_\-.:/=@%+,]+$/;

/** One argument for the shell. Plain text stays as it is, anything else is quoted for that shell. */
export function shellArg(value: string, shell: Shell): string {
    if (PLAIN.test(value)) return value;
    return shell === 'bash' ? `'${value.replaceAll("'", "'\\''")}'` : `'${value.replaceAll("'", "''")}'`;
}

/** The public address of the site for the game server, from NEXTAUTH_URL. Null when it is not set or not valid. */
export function siteUrl(env: Record<string, string | undefined>): string | null {
    if (!env.NEXTAUTH_URL) return null;
    try {
        return new URL(env.NEXTAUTH_URL).origin;
    } catch {
        return null;
    }
}

/**
 * The one line that starts the game server in tournament mode. The start script is the easier
 * way, and it keeps the token off the command line. This line is the alternative. `port` is the
 * UDP port on the computer, the game server port of the active event. Inside the container it is
 * always 1234.
 */
export function serverRunCommand(input: { siteUrl: string; token: string; port: number }, shell: Shell): string {
    const env = [`BLOBBY_TOURNAMENT=1`, `BLOBBY_SITE_URL=${input.siteUrl}`, `BLOBBY_SITE_TOKEN=${input.token}`];
    return [
        'docker run -d',
        `--name ${SERVER_CONTAINER}`,
        '--restart unless-stopped',
        `-p ${input.port}:${CONTAINER_PORT}/udp`,
        '-v blobby-data:/data',
        ...env.map((value) => `-e ${shellArg(value, shell)}`),
        SERVER_IMAGE,
    ].join(' ');
}

/**
 * Commands for a game server that runs already, run in the order given. None of them holds the
 * token. Update downloads the newest image first and then removes the old container.
 */
export const SERVER_HELP: { label: string; commands: string[] }[] = [
    { label: 'Stop', commands: [`docker stop ${SERVER_CONTAINER}`] },
    { label: 'Start again', commands: [`docker start ${SERVER_CONTAINER}`] },
    { label: 'Logs', commands: [`docker logs -f ${SERVER_CONTAINER}`] },
    { label: 'Update', commands: [`docker pull ${SERVER_IMAGE}`, `docker rm -f ${SERVER_CONTAINER}`] },
];

/** The Windows command, run as administrator, that opens the UDP port of the game server in the firewall. */
export function firewallCommand(port: number): string {
    return `New-NetFirewallRule -DisplayName "Blobby tournament server" -Direction Inbound -Protocol UDP -LocalPort ${port} -Action Allow`;
}

const SCRIPTS = 'https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2/main/scripts';

const PS1 = 'powershell -ExecutionPolicy Bypass -File .\\tournament-server.ps1';

/**
 * The start scripts in the game repository. They ask for the site address and the token once and
 * keep them, so `update` needs no new token.
 */
export const START_SCRIPTS: { system: string; href: string; download: string; command: string; update: string }[] = [
    {
        system: 'Windows',
        href: `${SCRIPTS}/tournament-server.ps1`,
        download: `iwr ${SCRIPTS}/tournament-server.ps1 -OutFile tournament-server.ps1`,
        command: `${PS1} start`,
        update: `${PS1} update`,
    },
    {
        system: 'Linux',
        href: `${SCRIPTS}/tournament-server.sh`,
        download: `curl -fsSLO ${SCRIPTS}/tournament-server.sh`,
        command: 'bash tournament-server.sh start',
        update: 'bash tournament-server.sh update',
    },
];
