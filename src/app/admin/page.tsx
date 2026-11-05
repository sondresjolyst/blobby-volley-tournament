import { SignOutButton } from '@/components/auth/SignOutButton';
import { requireAdmin } from '@/lib/auth/options';

export default async function Admin() {
    const session = await requireAdmin();
    return (
        <main>
            <h1>Admin</h1>
            <p>Signed in as {session.user?.name ?? 'admin'}.</p>
            <SignOutButton />
        </main>
    );
}
