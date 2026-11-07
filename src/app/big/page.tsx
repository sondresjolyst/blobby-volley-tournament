import type { Metadata } from 'next';
import { connection } from 'next/server';
import { BigScreen } from '@/components/big-screen/BigScreen';
import { bigScreenKeyMatches } from '@/lib/big-screen/key';
import { joinUrl, qrCode } from '@/lib/big-screen/qr';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getBigScreen } from '@/lib/store/big-screen';

// The key may be in the address, so no other site gets the address as a referrer.
export const metadata: Metadata = { title: 'Storskjerm · Blobby Volley Tournament', referrer: 'no-referrer' };

type Search = Record<string, string | string[] | undefined>;

/**
 * The big screen for the TV in the room. Public and read only. `?t=<id>` picks the tournament of
 * the bracket. The event code and the QR code only show with `?key=` set to BIG_SCREEN_KEY.
 */
export default async function BigScreenPage({ searchParams }: { searchParams: Promise<Search> }) {
    await connection();
    const { t, key } = await searchParams;
    const tournament = typeof t === 'string' ? parseId(t) : null;
    const keyed = typeof key === 'string' && bigScreenKeyMatches(key, process.env);
    const data = await getBigScreen(getPool(), tournament, keyed);
    const url = keyed ? joinUrl(process.env) : null;
    const qr = url ? { url, ...qrCode(url) } : null;
    return <BigScreen initial={data} tournament={tournament} screenKey={keyed ? key : null} qr={qr} />;
}
