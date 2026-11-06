import { createHash } from 'node:crypto';
import { getPool } from '@/lib/db';
import { refuseGameServer } from '@/lib/game-server/auth';
import { readBmpSize } from '@/lib/sponsors/bmp';
import { listServerSponsors } from '@/lib/store/sponsors';

/** The enabled sponsors of the active event in order, each with its game logo as a base64 BMP. */
export async function GET(req: Request) {
    const refused = refuseGameServer(req, process.env);
    if (refused) return refused;
    const { eventId, sponsors } = await listServerSponsors(getPool());
    const list = sponsors.map((sponsor) => {
        const size = readBmpSize(sponsor.gameLogo);
        return {
            sponsorId: sponsor.sponsorId,
            name: sponsor.name,
            logo: { format: 'bmp', width: size?.width ?? 0, height: size?.height ?? 0, hash: sponsor.gameLogoHash, data: Buffer.from(sponsor.gameLogo).toString('base64') },
        };
    });
    // The logo hashes stand in for the logos, so the version is cheap to work out.
    const content = JSON.stringify([eventId, list.map((s) => [s.sponsorId, s.name, s.logo.hash])]);
    const sponsorsVersion = createHash('sha256').update(content).digest('hex').slice(0, 16);
    return Response.json({ eventId, sponsorsVersion, sponsors: list }, { headers: { 'Cache-Control': 'no-store' } });
}
