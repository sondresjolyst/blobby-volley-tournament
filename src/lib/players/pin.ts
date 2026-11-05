import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PIN = /^[0-9]{4}$/;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

/** A PIN is exactly 4 digits. */
export function isValidPin(value: unknown): value is string {
    return typeof value === 'string' && PIN.test(value);
}

function derive(pin: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(pin, salt, KEY_BYTES, (error, key) => (error ? reject(error) : resolve(key)));
    });
}

export interface PinHash {
    hash: Buffer;
    salt: Buffer;
}

/** Hashes a PIN with scrypt and a new random salt for this player. */
export async function hashPin(pin: string): Promise<PinHash> {
    if (!isValidPin(pin)) throw new Error('A PIN must be 4 digits');
    const salt = randomBytes(SALT_BYTES);
    return { hash: await derive(pin, salt), salt };
}

/** Checks a PIN against the stored hash. The comparison takes the same time whatever the bytes are. */
export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
    if (!isValidPin(pin)) return false;
    const key = await derive(pin, stored.salt);
    return key.length === stored.hash.length && timingSafeEqual(key, stored.hash);
}

/** A hash to check against when no player has the nickname, so the answer takes as long as a real check. */
export const DUMMY_PIN_HASH: PinHash = { hash: Buffer.alloc(KEY_BYTES), salt: Buffer.alloc(SALT_BYTES) };
