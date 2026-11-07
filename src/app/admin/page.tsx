import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { requireAdmin } from '@/lib/auth/options';
import { bigScreenHref } from '@/lib/big-screen/key';
import { getPool } from '@/lib/db';
import { getActiveBigScreenKey } from '@/lib/store/events';

export default async function Admin() {
    const session = await requireAdmin();
    // The link carries the key of the active event, so the TV shows the join card.
    const bigScreen = bigScreenHref(await getActiveBigScreenKey(getPool()));
    return (
        <main>
            <h1>Admin</h1>
            <p>Signed in as {session.user?.name ?? 'admin'}.</p>
            <p>
                <Link href="/admin/events">Events</Link> | <Link href="/admin/tournaments">Tournaments</Link> | <Link href="/admin/matches">Matches</Link> | <Link href="/admin/game-server">Game server</Link> | <Link href={bigScreen}>Big screen</Link>
            </p>
            <SignOutButton />
        </main>
    );
}
