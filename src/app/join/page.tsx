import Link from 'next/link';
import { connection } from 'next/server';
import { errorMessage } from '@/components/players/messages';
import { getPool } from '@/lib/db';
import { NICKNAME_MAX_BYTES } from '@/lib/players/nickname';
import { getActiveEvent } from '@/lib/store/events';

export default async function Join({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    await connection();
    const { error } = await searchParams;
    const event = await getActiveEvent(getPool());
    const message = errorMessage(error);
    return (
        <main>
            <h1>Sign up</h1>
            {event ? (
                <>
                    <p>Event: {event.name}</p>
                    {message && <p role="alert">{message}</p>}
                    <form method="post" action="/api/player/signup">
                        <p>
                            <label>
                                Event code <input name="code" required autoComplete="off" autoCapitalize="characters" />
                            </label>
                        </p>
                        <p>
                            <label>
                                Nickname <input name="nickname" required maxLength={NICKNAME_MAX_BYTES} autoComplete="nickname" />
                            </label>
                        </p>
                        <p>
                            <label>
                                PIN (4 digits) <input name="pin" type="password" required inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="new-password" />
                            </label>
                        </p>
                        <button type="submit">Sign up</button>
                    </form>
                    <p>
                        Already signed up? <Link href="/login">Sign in</Link>
                    </p>
                </>
            ) : (
                <p>No event is open for sign-up right now.</p>
            )}
        </main>
    );
}
