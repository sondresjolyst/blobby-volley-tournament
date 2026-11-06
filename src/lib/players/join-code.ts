import { randomInt } from 'node:crypto';

/** Upper case letters and digits without 0, O, 1, I and L, so a code is easy to read out. */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 10;

const JOIN_CODE = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);

/**
 * A new secret join code from the cryptographic random source. The game sends it in its 16 byte
 * player name field, so it must fit in 15 bytes of ASCII.
 */
export function newJoinCode(): string {
    let code = '';
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
    return code;
}

export function isJoinCode(value: unknown): value is string {
    return typeof value === 'string' && JOIN_CODE.test(value);
}

/** The link that opens the game and joins the server with the player's code. */
export function joinLink(host: string, port: number, code: string): string {
    return `blobby://join?server=${host}:${port}&code=${code}`;
}
