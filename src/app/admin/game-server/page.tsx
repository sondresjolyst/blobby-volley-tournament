import { AdminShell } from '@/components/admin/AdminShell';
import { adminTime } from '@/components/admin/time';
import { GameServerHealth } from '@/components/game-server/GameServerHealth';
import { InfoButton } from '@/components/InfoButton';
import { GameServerToken } from '@/components/game-server/GameServerToken';
import { EventHost, FirstTimeSetup } from '@/components/game-server/SetupGuide';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { CONTAINER_PORT, serverImage, siteUrl } from '@/lib/game-server/commands';
import { getActiveEvent } from '@/lib/store/events';
import { getGameServerReportAge, getGameServerTokenInfo, LAST_USED_STEP_MS } from '@/lib/store/game-server-token';

/** The health of the game server and the one way to start it. Only the hash of the token is stored, so the page never shows an old token. */
export default async function GameServer() {
    await requireAdmin();
    const pool = getPool();
    const [info, event, age] = await Promise.all([getGameServerTokenInfo(pool), getActiveEvent(pool), getGameServerReportAge(pool)]);
    const site = siteUrl(process.env);
    const port = event?.serverPort ?? CONTAINER_PORT;
    return (
        <AdminShell section="game-server">
            <h1>Game server</h1>
            <h2>Health</h2>
            <div className="admin-field-label">
                <p>The line shows when the game server last reported to the site. Green means less than a minute ago.</p>
                <InfoButton label="About the health line">
                    <p>
                        Each call of the game server with the token is a report, and the site records one at most every {LAST_USED_STEP_MS / 1000} s. The game server syncs every few
                        seconds while it runs.
                    </p>
                </InfoButton>
            </div>
            <GameServerHealth initialAge={age} />
            <section aria-labelledby="start">
                <h2 id="start">Start the game server</h2>
                <p>
                    Select Make a token. The page then shows one command that starts the game server on UDP port {port}. One token serves the whole site, and the game server serves
                    the active event.
                </p>
                {!site && <p role="alert">NEXTAUTH_URL is not set, so this page does not know the address of the site. In the command, replace &lt;site address&gt; with the address of the site.</p>}
                <EventHost port={port} event={event} />
                {info ? (
                    <dl>
                        <dt>Token made</dt>
                        <dd>{adminTime(info.createdAt)}</dd>
                    </dl>
                ) : (
                    <p>There is no token yet. The game server API refuses every call until there is one.</p>
                )}
                <GameServerToken hasToken={info !== null} siteUrl={site} port={port} image={serverImage(process.env)}>
                    <FirstTimeSetup port={port} />
                </GameServerToken>
            </section>
        </AdminShell>
    );
}
