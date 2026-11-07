// The Docker commands that start the game server for the site. The variable names are the ones
// the game server reads in tournament mode.

const SERVER_REPOSITORY = 'sondresjo/blobby-server';
/** The image the game server runs when BLOBBY_SERVER_TAG is not set. */
export const DEFAULT_SERVER_IMAGE = `${SERVER_REPOSITORY}:latest`;
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

// The form of a Docker tag.
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/**
 * The game server image for the commands on the admin page, from BLOBBY_SERVER_TAG, such as `dev`
 * on a test site. It is the latest image when the tag is not set or not a valid tag.
 */
export function serverImage(env: Record<string, string | undefined>): string {
    const tag = env.BLOBBY_SERVER_TAG?.trim();
    return tag && TAG.test(tag) ? `${SERVER_REPOSITORY}:${tag}` : DEFAULT_SERVER_IMAGE;
}

/**
 * The one line that starts the game server in tournament mode. It is the main way on the admin
 * page, since it needs nothing but Docker. `port` is the UDP port on the computer, the game server
 * port of the active event. Inside the container it is always 1234. The token is base64url and the
 * site address is an origin, so the line is the same in PowerShell and bash.
 */
export function serverRunCommand(input: { siteUrl: string; token: string; port: number; image: string }, shell: Shell): string {
    const env = [`BLOBBY_TOURNAMENT=1`, `BLOBBY_SITE_URL=${input.siteUrl}`, `BLOBBY_SITE_TOKEN=${input.token}`];
    return [
        'docker run -d',
        `--name ${SERVER_CONTAINER}`,
        '--restart unless-stopped',
        `-p ${input.port}:${CONTAINER_PORT}/udp`,
        '-v blobby-data:/data',
        ...env.map((value) => `-e ${shellArg(value, shell)}`),
        input.image,
    ].join(' ');
}

/** Removes the old game server, so the start command can make it again with a new token or image. */
export const SERVER_REMOVE = `docker rm -f ${SERVER_CONTAINER}`;

/** Commands for a game server that runs already. None of them holds the token. */
export function serverHelp(image: string): { label: string; command: string }[] {
    return [
        { label: 'Stop', command: `docker stop ${SERVER_CONTAINER}` },
        { label: 'Start again', command: `docker start ${SERVER_CONTAINER}` },
        { label: 'Logs', command: `docker logs -f ${SERVER_CONTAINER}` },
        { label: 'Get the newest server', command: `docker pull ${image}` },
    ];
}

/** The Windows command, run as administrator, that opens the UDP port of the game server in the firewall. */
export function firewallCommand(port: number): string {
    return `New-NetFirewallRule -DisplayName "Blobby Volley server" -Direction Inbound -Protocol UDP -LocalPort ${port} -Action Allow`;
}

const SCRIPTS = 'https://raw.githubusercontent.com/sondresjolyst/blobbyvolley2/main/scripts';

const PS1 = 'powershell -ExecutionPolicy Bypass -File .\\tournament-server.ps1';

/**
 * The start scripts in the game repository. They ask for the site address, the token and the port
 * once and keep them, so `update` needs no new token. They run the latest image unless
 * BLOBBY_SCRIPT_IMAGE is set, so `image` sets it for another image and is null for the latest.
 */
export function startScripts(image: string): { system: string; href: string; download: string; image: string | null; command: string; update: string; setToken: string }[] {
    const other = image !== DEFAULT_SERVER_IMAGE;
    return [
        {
            system: 'Windows',
            href: `${SCRIPTS}/tournament-server.ps1`,
            download: `iwr ${SCRIPTS}/tournament-server.ps1 -OutFile tournament-server.ps1`,
            image: other ? `$env:BLOBBY_SCRIPT_IMAGE = '${image}'` : null,
            command: `${PS1} start`,
            update: `${PS1} update`,
            setToken: `${PS1} set-token`,
        },
        {
            system: 'Linux',
            href: `${SCRIPTS}/tournament-server.sh`,
            download: `curl -fsSLO ${SCRIPTS}/tournament-server.sh`,
            image: other ? `export BLOBBY_SCRIPT_IMAGE=${image}` : null,
            command: 'bash tournament-server.sh start',
            update: 'bash tournament-server.sh update',
            setToken: 'bash tournament-server.sh set-token',
        },
    ];
}
