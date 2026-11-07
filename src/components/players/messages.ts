// The errors of /join and /login, in the jokey Rogaland dialect of the LAN.
const MESSAGES: Record<string, string> = {
    'no-event': 'Ingen LAN e opent akkurat no. Ein admin må opna eit LAN først.',
    code: 'Den LAN-koden stemme ikkje.',
    taken: 'Det kallenavnet e allerede tatt på dette LANet.',
    'nickname-empty': 'Velg deg eit kallenavn.',
    'nickname-too-long': 'Kallenavnet e for langt. Det kan vera maks 15 byte, og æ, ø og å tel som 2.',
    'nickname-invalid': 'Kallenavnet har teikn som ikkje e lov.',
    pin: 'PIN-koden må vera 4 siffer.',
    wrong: 'Feil kallenavn eller PIN-kode.',
    locked: 'For mange feil PIN-koda. Kontoen din e låst ei stund. Prøv igjen seinare, eller be ein admin om å nullstilla PIN-koden.',
    busy: 'For mange feilforsøk frå dette nettverket. Prøv igjen seinare.',
    form: 'Nokke gjekk gale. Prøv igjen.',
};

// next-auth sends these to the sign-in page when the GitHub sign-in of an admin fails.
const ADMIN_CODES = new Set(['OAuthSignin', 'OAuthCallback', 'OAuthCreateAccount', 'OAuthAccountNotLinked', 'Callback', 'SessionRequired', 'Default']);

/** The text for an error code in the address. Unknown codes show nothing. */
export function errorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    if (ADMIN_CODES.has(code)) return 'Innlogginga med GitHub gjekk ikkje. Prøv igjen.';
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}
