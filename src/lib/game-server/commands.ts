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
    return shell === 'bash' ? `'${value.replaceAll("'", "'\''")}'` : `'${value.replaceAll("'", "''")}'`;
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
 * The one line that starts the game server in tournament mode. `port` is the UDP port on the
 * computer, the game server port of the active event. Inside the container it is always 1234.
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

/** Commands for a game server that runs already. None of them holds the token. */
export const SERVER_HELP: { label: string; command: string }[] = [
    { label: 'Stop', command: `docker stop ${SERVER_CONTAINER}` },
    { label: 'Start again', command: `docker start ${SERVER_CONTAINER}` },
    { label: 'Logs', command: `docker logs -f ${SERVER_CONTAINER}` },
    { label: 'Update', command: `docker rm -f ${SERVER_CONTAINER}` },
];
