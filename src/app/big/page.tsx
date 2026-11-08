import type { Metadata } from 'next';
import { connection } from 'next/server';
import { BigScreen } from '@/components/big-screen/BigScreen';
import { joinUrl, qrCode } from '@/lib/big-screen/qr';
import { parseScreenType } from '@/lib/big-screen/screens';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getBigScreen, screenCache } from '@/lib/store/big-screen';

// The key may be in the address, so no other site gets the address as a referrer.
export const metadata: Metadata = { title: 'Storskjerm · Blobby Volley Tournament', referrer: 'no-referrer' };

type Search = Record<string, string | string[] | undefined>;

/**
 * The big screen for the TV in the room. Public and read only. `?t=<id>` picks the tournament of
 * the bracket. The event code and the QR code only show with `?key=` set to the big screen key of
 * the active event. An admin finds it on the event page. `?screen=<type>` keeps this TV on one
 * screen, whatever the rotation of the event is.
 */
export default async function BigScreenPage({ searchParams }: { searchParams: Promise<Search> }) {
    await connection();
    const { t, key, screen } = await searchParams;
    const tournament = typeof t === 'string' ? parseId(t) : null;
    const data = await getBigScreen(getPool(), tournament, typeof key === 'string' ? key : null, screenCache);
    // The store only adds the event code when the key is right.
    const keyed = data.eventCode !== null;
    const url = keyed ? joinUrl(process.env) : null;
    const qr = url ? { url, ...qrCode(url) } : null;
    return <BigScreen initial={data} tournament={tournament} screenKey={keyed && typeof key === 'string' ? key : null} qr={qr} pinned={parseScreenType(screen)} />;
}
