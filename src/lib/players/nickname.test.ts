import { describe, expect, it } from 'vitest';
import { byteLength, nicknameKey, parseNickname } from './nickname';

describe('byteLength', () => {
    it('counts UTF-8 bytes, not characters', () => {
        expect(byteLength('abc')).toBe(3);
        expect(byteLength('æøå')).toBe(6);
        expect(byteLength('ÆØÅ')).toBe(6);
        expect(byteLength('😀')).toBe(4);
    });
});

describe('parseNickname', () => {
    it('accepts 15 ASCII bytes', () => {
        expect(parseNickname('abcdefghijklmno')).toEqual({ ok: true, nickname: 'abcdefghijklmno', key: 'abcdefghijklmno' });
    });

    it('rejects 16 ASCII bytes', () => {
        expect(parseNickname('abcdefghijklmnop')).toEqual({ ok: false, error: 'too-long' });
    });

    it('counts Norwegian letters as 2 bytes', () => {
        // 7 letters of 2 bytes and one of 1 byte is 15 bytes.
        expect(parseNickname('æøåæøåæa').ok).toBe(true);
        // 8 letters of 2 bytes is 16 bytes, though it is only 8 characters.
        expect(parseNickname('æøåæøåæø')).toEqual({ ok: false, error: 'too-long' });
    });

    it('trims before counting', () => {
        expect(parseNickname('   abcdefghijklmno  ')).toEqual({ ok: true, nickname: 'abcdefghijklmno', key: 'abcdefghijklmno' });
    });

    it('puts letters in NFC form, so å typed as a plus a ring counts as 2 bytes', () => {
        const decomposed = 'å'.repeat(7) + 'b';
        expect(byteLength(decomposed)).toBe(22);
        const result = parseNickname(decomposed);
        expect(result).toEqual({ ok: true, nickname: 'å'.repeat(7) + 'b', key: 'å'.repeat(7) + 'b' });
    });

    it('keeps the case of the nickname and gives a lower case key', () => {
        expect(parseNickname(' BlobbyØ ')).toEqual({ ok: true, nickname: 'BlobbyØ', key: 'blobbyø' });
    });

    it('rejects an empty or blank nickname', () => {
        expect(parseNickname('')).toEqual({ ok: false, error: 'empty' });
        expect(parseNickname('   ')).toEqual({ ok: false, error: 'empty' });
        expect(parseNickname(undefined)).toEqual({ ok: false, error: 'empty' });
    });

    it('rejects control and invisible characters', () => {
        expect(parseNickname('ab\u0000c')).toEqual({ ok: false, error: 'invalid' });
        expect(parseNickname('ab​c')).toEqual({ ok: false, error: 'invalid' });
    });
});

describe('nicknameKey', () => {
    it('gives the same key to nicknames that differ only in case or spaces around them', () => {
        expect(nicknameKey('Ola')).toBe(nicknameKey(' OLA '));
        expect(nicknameKey('Ærlig')).toBe(nicknameKey('ærlig'));
    });

    it('gives the same key to composed and decomposed å', () => {
        expect(nicknameKey('Å')).toBe(nicknameKey('Å'));
    });
});
