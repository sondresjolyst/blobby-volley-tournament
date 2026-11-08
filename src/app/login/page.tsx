import Link from 'next/link';
import { connection } from 'next/server';
import { AdminSignInButton } from '@/components/auth/AdminSignInButton';
import { InfoLabel } from '@/components/InfoButton';
import { FIELD_INFO } from '@/components/player/info';
import { errorMessage } from '@/components/players/messages';
import { AuthPage } from '@/components/site/AuthPage';
import { NoEventText } from '@/components/site/NoEvent';
import s from '@/components/site/site.module.css';
import { safeCallback } from '@/lib/auth/gate';
import { getPool } from '@/lib/db';
import { getActiveEvent } from '@/lib/store/events';
import { NO_LAN } from '@/lib/texts';

type Search = { error?: string | string[]; callbackUrl?: string | string[] };

/**
 * The one sign-in page. Players sign in with nickname and PIN. Admins sign in with GitHub below,
 * and the admin pages send a signed out visitor here with `?callbackUrl=`.
 */
export default async function Login({ searchParams }: { searchParams: Promise<Search> }) {
    await connection();
    const { error, callbackUrl } = await searchParams;
    const event = await getActiveEvent(getPool());
    const message = errorMessage(error);
    const fromAdmin = typeof callbackUrl === 'string';
    return (
        <AuthPage title={event ? event.name : NO_LAN} intro={event ? 'Velkommen tebake! Skriv kallenavnet og PIN-koden din.' : undefined} adminLink={false}>
            {message && (
                <p role="alert" className={s.authAlert}>
                    {message}
                </p>
            )}
            {event ? (
                <>
                    <form method="post" action="/api/player/signin" className={s.authCard} aria-labelledby="logg-inn">
                        <h2 id="logg-inn" className={s.authCardTitle}>
                            Logg inn
                        </h2>
                        <div className={s.authField}>
                            <InfoLabel htmlFor="nickname" className={s.authLabel} text="Kallenavn" info={FIELD_INFO.signInNickname.label}>
                                <p>{FIELD_INFO.signInNickname.text}</p>
                            </InfoLabel>
                            <input id="nickname" name="nickname" required autoComplete="username" aria-describedby="nickname-help" className={s.authInput} />
                        </div>
                        <div className={s.authField}>
                            <InfoLabel htmlFor="pin" className={s.authLabel} text="PIN-kode" info={FIELD_INFO.signInPin.label}>
                                <p>{FIELD_INFO.signInPin.text}</p>
                            </InfoLabel>
                            <input
                                id="pin"
                                name="pin"
                                type="password"
                                required
                                inputMode="numeric"
                                pattern="[0-9]{4}"
                                minLength={4}
                                maxLength={4}
                                autoComplete="current-password"
                                aria-describedby="pin-hint pin-help"
                                className={`${s.authInput} ${s.authPin}`}
                            />
                            <span id="pin-hint" className={s.authHint}>
                                Glømt PIN-koden? Spør ein admin.
                            </span>
                        </div>
                        <button type="submit" className={s.authSubmit}>
                            Logg inn
                        </button>
                    </form>
                    <p className={s.authSwitch}>
                        Ny her? <Link href="/join">Bli med</Link>
                    </p>
                </>
            ) : (
                <NoEventText />
            )}
            <div className={s.adminBox}>
                {fromAdmin && <p className={s.adminHint}>Den sidå e bare for admin. Logg inn med GitHub.</p>}
                <AdminSignInButton callbackUrl={fromAdmin ? safeCallback(callbackUrl) : '/admin'} className={s.adminButton} />
            </div>
        </AuthPage>
    );
}
