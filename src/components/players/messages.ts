const MESSAGES: Record<string, string> = {
    'no-event': 'No event is open right now.',
    code: 'The event code is wrong.',
    taken: 'That nickname is taken in this event.',
    'nickname-empty': 'Choose a nickname.',
    'nickname-too-long': 'The nickname is too long. It can be at most 15 bytes, and letters such as æ, ø and å count as 2.',
    'nickname-invalid': 'The nickname has characters that are not allowed.',
    pin: 'The PIN must be 4 digits.',
    wrong: 'Wrong nickname or PIN.',
    locked: 'Too many wrong PINs. Your account is locked for a while. Try again later or ask an admin to reset your PIN.',
    busy: 'Too many failed attempts from this network. Try again later.',
    form: 'Something went wrong. Try again.',
};

/** The text for an error code in the address. Unknown codes show nothing. */
export function errorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}
