import { describe, expect, it } from 'vitest';
import { joinUrl, qrCode } from './qr';

describe('qrCode', () => {
    it('draws the code as one path of squares in a view box of its size', () => {
        const code = qrCode('https://lan.example/join');
        // Version 2 at medium correction fits this address: 25 modules.
        expect(code.size).toBe(25);
        expect(code.path).toMatch(/^M[0-9 LZM]+Z$/);
    });

    it('gives the same code for the same text', () => {
        expect(qrCode('https://lan.example/join')).toEqual(qrCode('https://lan.example/join'));
    });
});

describe('joinUrl', () => {
    it('builds the sign-up address from NEXTAUTH_URL', () => {
        expect(joinUrl({ NEXTAUTH_URL: 'https://lan.example' })).toBe('https://lan.example/join');
        expect(joinUrl({ NEXTAUTH_URL: 'https://lan.example/sub/' })).toBe('https://lan.example/join');
    });

    it('is null without a valid NEXTAUTH_URL', () => {
        expect(joinUrl({})).toBeNull();
        expect(joinUrl({ NEXTAUTH_URL: 'not a url' })).toBeNull();
    });
});
