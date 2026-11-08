// The errors of /join and /login, in the jokey Rogaland dialect of the LAN.
import { GITHUB_SIGN_IN_FAILED, NO_LAN_OPEN, SOMETHING_WENT_WRONG } from '@/lib/texts';

const MESSAGES: Record<string, string> = {
    'no-event': NO_LAN_OPEN,
    code: 'Den LAN-koden stemme ikkje.',
    taken: 'Det kallenavnet e allerede tatt på dette LANet.',
    'nickname-empty': 'Velg deg eit kallenavn.',
    'nickname-too-long': 'Kallenavnet e for langt. Bruk maks 15 teikn. Æ, ø og å tel som 2.',
    'nickname-invalid': 'Kallenavnet har teikn som ikkje e lov.',
    pin: 'PIN-koden må vera 4 siffer.',
    wrong: 'Feil kallenavn eller PIN-kode.',
    locked: 'For mange feil PIN-koda. Kontoen din e låst i minst 15 minutt. Vent, eller be ein admin låsa deg opp.',
    busy: 'For mange feil LAN-koda eller ukjente kallenavn frå dette nettverket. Vent te neste heile time og prøv igjen.',
    pins: 'For mange feil PIN-koda frå dette nettverket. Vent te neste heile time og prøv igjen.',
    'sign-ups': 'For mange nye spelara frå dette nettverket. Vent te neste heile time og prøv igjen.',
    form: SOMETHING_WENT_WRONG,
};

// next-auth sends these to the sign-in page when the GitHub sign-in of an admin fails.
const ADMIN_CODES = new Set(['OAuthSignin', 'OAuthCallback', 'OAuthCreateAccount', 'OAuthAccountNotLinked', 'Callback', 'SessionRequired', 'Default']);

/** The text for an error code in the address. Unknown codes show nothing. */
export function errorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    if (ADMIN_CODES.has(code)) return `${GITHUB_SIGN_IN_FAILED} Prøv igjen.`;
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}
