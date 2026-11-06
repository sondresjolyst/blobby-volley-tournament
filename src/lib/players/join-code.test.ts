import { describe, expect, it } from 'vitest';
import { isJoinCode, JOIN_CODE_ALPHABET, joinLink, newJoinCode } from './join-code';

describe('newJoinCode', () => {
    it('gives 10 characters without 0, O, 1, I or L, which fit the 15 byte name field', () => {
        expect(JOIN_CODE_ALPHABET).toHaveLength(31);
        expect(JOIN_CODE_ALPHABET).not.toMatch(/[0O1IL]/);
        for (let i = 0; i < 200; i++) {
            const code = newJoinCode();
            expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
            expect(Buffer.byteLength(code, 'ascii')).toBeLessThanOrEqual(15);
            expect(isJoinCode(code)).toBe(true);
        }
    });

    it('uses every character of the alphabet and does not repeat codes', () => {
        const codes = Array.from({ length: 2000 }, newJoinCode);
        expect(new Set(codes).size).toBe(codes.length);
        expect(new Set(codes.join('')).size).toBe(JOIN_CODE_ALPHABET.length);
    });
});

describe('isJoinCode', () => {
    it.each(['ABCDEFGHJK', '23456789AB'])('accepts %s', (code) => expect(isJoinCode(code)).toBe(true));
    it.each(['ABCDEFGHJ', 'ABCDEFGHJKM', 'abcdefghjk', 'ABCDEFGHJ0', 'ABCDEFGHJO', 'ABCDEFGHJ1', 'ABCDEFGHJI', 'ABCDEFGHJL', 12345678, null])('refuses %s', (code) =>
        expect(isJoinCode(code)).toBe(false),
    );
});

describe('joinLink', () => {
    it('builds the blobby link the game opens', () => {
        expect(joinLink('lan-pc.local', 1234, 'ABCDEFGHJK')).toBe('blobby://join?server=lan-pc.local:1234&code=ABCDEFGHJK');
    });
});
