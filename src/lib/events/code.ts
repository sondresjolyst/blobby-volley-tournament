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

/** The longest suffix a name code needs, for a name of one letter. */
const MAX_SUFFIX = MIN_LENGTH - 2;

/**
 * Random characters for the end of a code made from a name. Make it once and pass it to
 * `eventCodeFromName` on every change of the name, so the end stays the same while the admin types.
 */
export function randomSuffix(): string {
    return randomCharacters(MAX_SUFFIX);
}

/**
 * A code made from the event name and `suffix`, such as JULALAN-2026-K7RM from JulaLAN 2026. The
 * name is public, so the random end keeps the code hard to guess. Æ, Ø and Å are spelled out, other
 * accents are dropped and every run of other characters becomes one hyphen. A short name gets more
 * of the suffix. A name without letters or digits gives null.
 */
export function eventCodeFromName(name: string, suffix: string): string | null {
    const slug = name
        .toUpperCase()
        .replace(/[ÆØÅ]/g, (letter) => NORWEGIAN[letter])
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+/, '')
        .slice(0, MAX_LENGTH - GROUP - 1)
        .replace(/-+$/, '');
    if (slug === '') return null;
    return `${slug}-${suffix.slice(0, Math.max(GROUP, MIN_LENGTH - 1 - slug.length))}`;
}

/** The code to suggest for a new event: from the name and `suffix` when it has a name, otherwise random. */
export function suggestEventCode(name: string, suffix: string): string {
    return eventCodeFromName(name, suffix) ?? randomEventCode();
}
