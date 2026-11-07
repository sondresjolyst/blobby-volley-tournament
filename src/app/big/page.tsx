import type { Metadata } from 'next';
import { connection } from 'next/server';
import { BigScreen } from '@/components/big-screen/BigScreen';
import { joinUrl, qrCode } from '@/lib/big-screen/qr';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getBigScreen } from '@/lib/store/big-screen';
import { getActiveEvent } from '@/lib/store/events';

export const metadata: Metadata = { title: 'Storskjerm · Blobby Volley Tournament' };

/** The big screen for the TV in the room. Public and read only. `?t=<id>` picks the tournament of the bracket. */
export default async function BigScreenPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
    await connection();
    const { t } = await searchParams;
    const tournament = typeof t === 'string' ? parseId(t) : null;
    const pool = getPool();
    const [data, event] = await Promise.all([getBigScreen(pool, tournament), getActiveEvent(pool)]);
    const url = joinUrl(process.env);
    const join = event ? { code: event.code, url, qr: url ? qrCode(url) : null } : null;
    return <BigScreen initial={data} tournament={tournament} join={join} />;
}
