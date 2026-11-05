export const NICKNAME_MAX_BYTES = 15;

const encoder = new TextEncoder();

// Control and format characters, such as zero width spaces, are not allowed in a nickname.
const HIDDEN = /\p{C}/u;

/** The length in UTF-8 bytes. Norwegian letters such as å count as 2. */
export function byteLength(value: string): number {
    return encoder.encode(value).length;
}

export type NicknameResult = { ok: true; nickname: string; key: string } | { ok: false; error: 'empty' | 'too-long' | 'invalid' };

/**
 * Trims the nickname and puts it in NFC form, so å typed as a plus a ring counts as one letter.
 * The key is the nickname in lower case. It decides whether two nicknames are the same.
 */
export function parseNickname(input: unknown): NicknameResult {
    if (typeof input !== 'string') return { ok: false, error: 'empty' };
    const nickname = input.normalize('NFC').trim();
    if (nickname.length === 0) return { ok: false, error: 'empty' };
    if (HIDDEN.test(nickname)) return { ok: false, error: 'invalid' };
    const key = nicknameKey(nickname);
    if (byteLength(nickname) > NICKNAME_MAX_BYTES || byteLength(key) > NICKNAME_MAX_BYTES) return { ok: false, error: 'too-long' };
    return { ok: true, nickname, key };
}

/** The form used to compare nicknames. Two nicknames that differ only in case get the same key. */
export function nicknameKey(nickname: string): string {
    return nickname.normalize('NFC').trim().toLowerCase();
}
