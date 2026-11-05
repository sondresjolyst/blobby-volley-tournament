import * as crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPin, isValidPin, verifyPin } from './pin';

vi.mock('node:crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:crypto')>();
    return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

afterEach(() => {
    vi.mocked(crypto.timingSafeEqual).mockClear();
});

describe('isValidPin', () => {
    it.each(['0000', '1234', '9999'])('accepts %s', (pin) => {
        expect(isValidPin(pin)).toBe(true);
    });

    it.each(['123', '12345', 'abcd', '12 4', ' 1234', '１２３４', '', 1234, undefined])('rejects %s', (pin) => {
        expect(isValidPin(pin)).toBe(false);
    });
});

describe('hashPin', () => {
    it('does not store the PIN in plain text', async () => {
        const { hash, salt } = await hashPin('1234');
        expect(hash.toString('utf8')).not.toContain('1234');
        expect(hash.toString('hex')).not.toContain(Buffer.from('1234').toString('hex'));
        expect(hash.length).toBe(32);
        expect(salt.length).toBe(16);
    });

    it('uses scrypt with the salt', async () => {
        const { hash, salt } = await hashPin('1234');
        expect(hash.equals(crypto.scryptSync('1234', salt, 32))).toBe(true);
    });

    it('gives each player a new salt, so the same PIN hashes differently', async () => {
        const a = await hashPin('1234');
        const b = await hashPin('1234');
        expect(a.salt.equals(b.salt)).toBe(false);
        expect(a.hash.equals(b.hash)).toBe(false);
    });

    it('refuses a PIN that is not 4 digits', async () => {
        await expect(hashPin('12345')).rejects.toThrow('4 digits');
    });
});

describe('verifyPin', () => {
    it('accepts the right PIN', async () => {
        expect(await verifyPin('4321', await hashPin('4321'))).toBe(true);
    });

    it('rejects a wrong PIN', async () => {
        expect(await verifyPin('4320', await hashPin('4321'))).toBe(false);
    });

    it('rejects a PIN that is not 4 digits without hashing it', async () => {
        expect(await verifyPin('43210', await hashPin('4321'))).toBe(false);
    });

    it('compares in constant time', async () => {
        const stored = await hashPin('4321');
        await verifyPin('4320', stored);
        await verifyPin('4321', stored);
        expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(2);
    });
});
