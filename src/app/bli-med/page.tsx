import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { InfoLabel } from '@/components/InfoButton';
import { FIELD_INFO } from '@/components/player/info';
import { foza } from '@/components/player/text';
import { errorMessage } from '@/components/players/messages';
import { AuthPage } from '@/components/site/AuthPage';
import { NoEvent } from '@/components/site/NoEvent';
import s from '@/components/site/site.module.css';
import { getPool } from '@/lib/db';
import { getCurrentAccount } from '@/lib/players/current';
import { getActiveEvent } from '@/lib/store/events';

/**
 * The step where a signed in account joins the active event with its code, once per LAN. Elo and
 * the nickname come along. Foza and the matches are new for each LAN.
 */
export default async function JoinEvent({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    await connection();
    const account = await getCurrentAccount();
    if (!account) redirect('/login');
    if (account.player) redirect('/me');
    const event = await getActiveEvent(getPool());
    if (!event) return <NoEvent />;
    const message = errorMessage((await searchParams).error);
    return (
        <AuthPage title={event.name} intro={`Hei igjen, ${account.nickname}! Skriv LAN-koden, så e du med og får ${foza(event.startingFoza)} å satsa. Elo-en din blir med deg.`}>
            {message && (
                <p role="alert" className={s.authAlert}>
                    {message}
                </p>
            )}
            <form method="post" action="/api/player/join-event" className={s.authCard} aria-labelledby="bli-med-lan">
                <h2 id="bli-med-lan" className={s.authCardTitle}>
                    Bli med på dette LANet
                </h2>
                <div className={s.authField}>
                    <InfoLabel htmlFor="code" className={s.authLabel} text="LAN-kode" info={FIELD_INFO.code.label}>
                        <p>{FIELD_INFO.code.text}</p>
                    </InfoLabel>
                    <input id="code" name="code" required autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="code-hint code-help" className={`${s.authInput} ${s.authCode}`} />
                    <span id="code-hint" className={s.authHint}>
                        Står på storskjermen, eller spør ein admin.
                    </span>
                </div>
                <button type="submit" className={s.authSubmit}>
                    Bli med på LANet
                </button>
            </form>
            <form method="post" action="/api/player/signout" className={s.authSwitch}>
                Ikkje deg?{' '}
                <button type="submit" className={s.authLinkButton}>
                    Logg ut
                </button>
            </form>
        </AuthPage>
    );
}
