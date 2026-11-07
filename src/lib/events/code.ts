import { READABLE_ALPHABET } from '@/lib/readable';

// At least 8 characters, so the code cannot be guessed in the attempts the limits allow.
const CODE = /^[A-Z0-9-]{8,32}$/;
const MAX_LENGTH = 32;
const MIN_LENGTH = 8;
const GROUP = 4;

/** Event codes are compared in upper case, so a player can type them either way. */
export function normalizeEventCode(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/** True for a normalized event code that the event form accepts. */
export function isEventCode(value: string): boolean {
    return CODE.test(value);
}

// Web Crypto works both in the browser and on the server. Bytes past the last whole run of the
// alphabet are thrown away, so every character is equally likely.
function randomCharacters(count: number): string {
    const limit = 256 - (256 % READABLE_ALPHABET.length);
    const byte = new Uint8Array(1);
    let out = '';
    while (out.length < count) {
        globalThis.crypto.getRandomValues(byte);
        if (byte[0] < limit) out += READABLE_ALPHABET[byte[0] % READABLE_ALPHABET.length];
    }
    return out;
}

/** A random code of two groups of four, such as K7RM-P4XQ, without characters that look alike. */
export function randomEventCode(): string {
    return `${randomCharacters(GROUP)}-${randomCharacters(GROUP)}`;
}

const NORWEGIAN: Record<string, string> = { Æ: 'AE', Ø: 'OE', Å: 'AA' };

/**
 * A code made from the event name, such as JULALAN-2026 from JulaLAN 2026. Æ, Ø and Å are spelled
 * out, other accents are dropped and every run of other characters becomes one hyphen. A short name
 * gets random characters after it. A name without letters or digits gives null.
 */
export function eventCodeFromName(name: string): string | null {
    const slug = name
        .toUpperCase()
        .replace(/[ÆØÅ]/g, (letter) => NORWEGIAN[letter])
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '-')
        .slice(0, MAX_LENGTH)
        .replace(/^-+|-+$/g, '');
    if (slug === '') return null;
    if (slug.length >= MIN_LENGTH) return slug;
    return `${slug}-${randomCharacters(Math.max(GROUP, MIN_LENGTH - 1 - slug.length))}`;
}

/** The code to suggest for a new event: from the name when it has one, otherwise random. */
export function suggestEventCode(name: string): string {
    return eventCodeFromName(name) ?? randomEventCode();
}
