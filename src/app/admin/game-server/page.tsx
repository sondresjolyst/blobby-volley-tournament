import { AdminShell } from '@/components/admin/AdminShell';
import { adminTime } from '@/components/admin/time';
import { GameServerHealth } from '@/components/game-server/GameServerHealth';
import { GameServerToken } from '@/components/game-server/GameServerToken';
import { SetupGuide } from '@/components/game-server/SetupGuide';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { CONTAINER_PORT, siteUrl } from '@/lib/game-server/commands';
import { reportAge } from '@/lib/game-server/health';
import { getActiveEvent } from '@/lib/store/events';
import { getGameServerTokenInfo } from '@/lib/store/game-server-token';

/** The health of the game server and its token. Admins make the token here. Only its hash is stored, so the page never shows an old token. */
export default async function GameServer() {
    await requireAdmin();
    const pool = getPool();
    const [info, event] = await Promise.all([getGameServerTokenInfo(pool), getActiveEvent(pool)]);
    const site = siteUrl(process.env);
    const port = event?.serverPort ?? CONTAINER_PORT;
    return (
        <AdminShell section="game-server">
            <h1>Game server</h1>
            <h2>Health</h2>
            <p>Each call of the game server with the token counts as a report. It syncs every few seconds while it runs. Green means a report came in the last minute.</p>
            <GameServerHealth initialAge={reportAge(info?.lastUsedAt ?? null, new Date())} />
            <SetupGuide siteUrl={site} port={port} />
            <h2>Token</h2>
            <p>The game server sends this token to the site API. There is one token for the whole site. The game server serves the active event.</p>
            {info ? (
                <dl>
                    <dt>Token made</dt>
                    <dd>{adminTime(info.createdAt)}</dd>
                </dl>
            ) : (
                <p>There is no token yet. The game server API refuses every call until there is one.</p>
            )}
            <GameServerToken hasToken={info !== null} siteUrl={site} port={port} />
        </AdminShell>
    );
}
