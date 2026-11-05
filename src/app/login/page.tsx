import Link from 'next/link';
import { connection } from 'next/server';
import { errorMessage } from '@/components/players/messages';
import { getPool } from '@/lib/db';
import { getActiveEvent } from '@/lib/store/events';

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    await connection();
    const { error } = await searchParams;
    const event = await getActiveEvent(getPool());
    const message = errorMessage(error);
    return (
        <main>
            <h1>Sign in</h1>
            {event ? (
                <>
                    <p>Event: {event.name}</p>
                    {message && <p role="alert">{message}</p>}
                    <form method="post" action="/api/player/signin">
                        <p>
                            <label>
                                Nickname <input name="nickname" required autoComplete="username" />
                            </label>
                        </p>
                        <p>
                            <label>
                                PIN <input name="pin" type="password" required inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="current-password" />
                            </label>
                        </p>
                        <button type="submit">Sign in</button>
                    </form>
                    <p>
                        New here? <Link href="/join">Sign up</Link>
                    </p>
                </>
            ) : (
                <p>No event is open right now.</p>
            )}
        </main>
    );
}
