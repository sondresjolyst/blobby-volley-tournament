import { createHash } from 'node:crypto';
import { getPool } from '@/lib/db';
import { refuseGameServer } from '@/lib/game-server/auth';
import { readBmpInfo } from '@/lib/sponsors/bmp';
import { makeGameLogo } from '@/lib/sponsors/logo';
import { listServerSponsors, upgradeGameLogos } from '@/lib/store/sponsors';

/** The board style and the enabled sponsors of the active event in order, each with its game logo as a base64 BMP. */
export async function GET(req: Request) {
    const refused = refuseGameServer(req, process.env);
    if (refused) return refused;
    const pool = getPool();
    // Game logos stored before the alpha channel are made again the first time the game asks.
    await upgradeGameLogos(pool, makeGameLogo);
    const { eventId, gameBoard, sponsors } = await listServerSponsors(pool);
    const list = sponsors.map((sponsor) => {
        const info = readBmpInfo(sponsor.gameLogo);
        return {
            sponsorId: sponsor.sponsorId,
            name: sponsor.name,
            logo: {
                format: 'bmp',
                width: info?.width ?? 0,
                height: info?.height ?? 0,
                bitsPerPixel: info?.bitsPerPixel ?? 0,
                hash: sponsor.gameLogoHash,
                data: Buffer.from(sponsor.gameLogo).toString('base64'),
            },
        };
    });
    // The logo hashes stand in for the logos, so the version is cheap to work out. The board
    // style is in it, so turning the board off changes the version even with no sponsors.
    const content = JSON.stringify([eventId, gameBoard, list.map((s) => [s.sponsorId, s.name, s.logo.hash])]);
    const sponsorsVersion = createHash('sha256').update(content).digest('hex').slice(0, 16);
    return Response.json({ eventId, gameBoard, sponsorsVersion, sponsors: list }, { headers: { 'Cache-Control': 'no-store' } });
}
