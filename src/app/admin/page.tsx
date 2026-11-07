import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { requireAdmin } from '@/lib/auth/options';

export default async function Admin() {
    const session = await requireAdmin();
    return (
        <main>
            <h1>Admin</h1>
            <p>Signed in as {session.user?.name ?? 'admin'}.</p>
            <p>
                <Link href="/admin/events">Events</Link> | <Link href="/admin/tournaments">Tournaments</Link> | <Link href="/admin/matches">Matches</Link> | <Link href="/big">Big screen</Link>
            </p>
            <SignOutButton />
        </main>
    );
}
