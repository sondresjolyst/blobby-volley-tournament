import { describe, expect, it } from 'vitest';
import { ALPHA_MASK, BLUE_MASK, BMP_HEADER_BYTES, encodeBmp32, GREEN_MASK, readBmpInfo, RED_MASK } from './bmp';

describe('encodeBmp32', () => {
    // Top row red, green, half see-through blue. Bottom row white, clear black, grey.
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 128, 255, 255, 255, 255, 0, 0, 0, 0, 128, 128, 128, 255]);

    it('writes the file header and a BITMAPV4HEADER with bit fields', () => {
        const bmp = encodeBmp32(rgba, 3, 2);
        const view = new DataView(bmp.buffer);
        expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
        expect(BMP_HEADER_BYTES).toBe(122);
        expect(bmp.length).toBe(122 + 3 * 4 * 2);
        expect(view.getUint32(2, true)).toBe(bmp.length);
        expect(view.getUint32(10, true)).toBe(122);
        expect(view.getUint32(14, true)).toBe(108);
        expect(view.getInt32(18, true)).toBe(3);
        // A positive height means the rows are stored from the bottom up.
        expect(view.getInt32(22, true)).toBe(2);
        expect(view.getUint16(26, true)).toBe(1);
        expect(view.getUint16(28, true)).toBe(32);
        expect(view.getUint32(30, true)).toBe(3);
        expect(view.getUint32(34, true)).toBe(24);
    });

    it('writes the red, green, blue and alpha masks and the sRGB colour space', () => {
        const view = new DataView(encodeBmp32(rgba, 3, 2).buffer);
        expect([view.getUint32(54, true), view.getUint32(58, true), view.getUint32(62, true), view.getUint32(66, true)]).toEqual([0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000]);
        expect([RED_MASK, GREEN_MASK, BLUE_MASK, ALPHA_MASK]).toEqual([0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000]);
        expect(String.fromCharCode(...encodeBmp32(rgba, 3, 2).slice(70, 74)).split('').reverse().join('')).toBe('sRGB');
    });

    it('stores the rows from the bottom up in blue, green, red, alpha order without padding', () => {
        const pixels = Array.from(encodeBmp32(rgba, 3, 2).slice(BMP_HEADER_BYTES));
        expect(pixels).toEqual([255, 255, 255, 255, 0, 0, 0, 0, 128, 128, 128, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 128]);
    });

    it('refuses pixels that do not fit the size', () => {
        expect(() => encodeBmp32(new Uint8Array(7), 2, 1)).toThrow();
        expect(() => encodeBmp32(new Uint8Array(0), 0, 0)).toThrow();
    });
});

describe('readBmpInfo', () => {
    it('reads the size and the bits per pixel back', () => {
        expect(readBmpInfo(encodeBmp32(new Uint8Array(160 * 32 * 4), 160, 32))).toEqual({ width: 160, height: 32, bitsPerPixel: 32 });
    });

    it('reads a 24-bit BMP from before the alpha channel', () => {
        const old = new Uint8Array(54 + 4 * 32);
        const view = new DataView(old.buffer);
        old.set([0x42, 0x4d]);
        view.setUint32(14, 40, true);
        view.setInt32(18, 1, true);
        view.setInt32(22, 32, true);
        view.setUint16(28, 24, true);
        expect(readBmpInfo(old)).toEqual({ width: 1, height: 32, bitsPerPixel: 24 });
    });

    it('gives null for bytes that are not such a BMP', () => {
        expect(readBmpInfo(new Uint8Array(10))).toBeNull();
        expect(readBmpInfo(new Uint8Array(130))).toBeNull();
        const other = encodeBmp32(new Uint8Array(4), 1, 1);
        new DataView(other.buffer).setUint32(30, 0, true);
        expect(readBmpInfo(other)).toBeNull();
    });
});
