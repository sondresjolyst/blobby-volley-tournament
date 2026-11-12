import Link from 'next/link';
import { connection } from 'next/server';
import { InfoLabel } from '@/components/InfoButton';
import { FIELD_INFO } from '@/components/player/info';
import { errorMessage } from '@/components/players/messages';
import { foza } from '@/components/player/text';
import { AuthPage } from '@/components/site/AuthPage';
import { NoEvent } from '@/components/site/NoEvent';
import s from '@/components/site/site.module.css';
import { getPool } from '@/lib/db';
import { NICKNAME_MAX_BYTES } from '@/lib/players/nickname';
import { getActiveEvent } from '@/lib/store/events';

export default async function Join({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    await connection();
    const { error } = await searchParams;
    const event = await getActiveEvent(getPool());
    const message = errorMessage(error);
    if (!event) return <NoEvent />;
    return (
        <AuthPage title={event.name} intro={`Velg deg eit kallenavn, så får du ${foza(event.startingFoza)} å satsa. Finn fram nædæ og ostepoppen!`}>
            {message && (
                <p role="alert" className={s.authAlert}>
                    {message}
                </p>
            )}
            <form method="post" action="/api/player/signup" className={s.authCard} aria-labelledby="bli-med">
                <h2 id="bli-med" className={s.authCardTitle}>
                    Bli med
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
                <div className={s.authField}>
                    <InfoLabel htmlFor="nickname" className={s.authLabel} text="Kallenavn" info={FIELD_INFO.nickname.label}>
                        <p>{FIELD_INFO.nickname.text}</p>
                    </InfoLabel>
                    <input id="nickname" name="nickname" required maxLength={NICKNAME_MAX_BYTES} autoComplete="nickname" aria-describedby="nickname-hint nickname-help" className={s.authInput} />
                    <span id="nickname-hint" className={s.authHint}>
                        Maks 15 teikn. Æ, ø og å tel som 2.
                    </span>
                </div>
                <div className={s.authField}>
                    <InfoLabel htmlFor="pin" className={s.authLabel} text="PIN-kode (4 siffer)" info={FIELD_INFO.pin.label}>
                        <p>{FIELD_INFO.pin.text}</p>
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
                        autoComplete="new-password"
                        aria-describedby="pin-hint pin-help"
                        className={`${s.authInput} ${s.authPin}`}
                    />
                    <span id="pin-hint" className={s.authHint}>
                        Glømme du PIN-koden, spør ein admin.
                    </span>
                </div>
                <button type="submit" className={s.authSubmit} data-busy-label="Sender…">
                    Bli med på LANet
                </button>
            </form>
            <p className={s.authSwitch}>
                Har du vore med før? <Link href="/login">Logg inn</Link>
            </p>
            <p className={s.authSwitch}>
                Har du ikkje spelet ennå? <Link href="/last-ned">Last det ned</Link>
            </p>
        </AuthPage>
    );
}
