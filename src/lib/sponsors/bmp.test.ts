import { describe, expect, it } from 'vitest';
import { BMP_HEADER_BYTES, encodeBmp24, readBmpSize } from './bmp';

describe('encodeBmp24', () => {
    // Top row red, green, blue. Bottom row white, black, grey.
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 128, 128, 128]);

    it('writes the BMP and info headers', () => {
        const bmp = encodeBmp24(rgb, 3, 2);
        const view = new DataView(bmp.buffer);
        expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
        // 3 pixels of 3 bytes is 9, padded to 12.
        expect(bmp.length).toBe(BMP_HEADER_BYTES + 12 * 2);
        expect(view.getUint32(2, true)).toBe(bmp.length);
        expect(view.getUint32(10, true)).toBe(54);
        expect(view.getUint32(14, true)).toBe(40);
        expect(view.getInt32(18, true)).toBe(3);
        expect(view.getInt32(22, true)).toBe(2);
        expect(view.getUint16(26, true)).toBe(1);
        expect(view.getUint16(28, true)).toBe(24);
        expect(view.getUint32(30, true)).toBe(0);
        expect(view.getUint32(34, true)).toBe(24);
    });

    it('stores the rows from the bottom up in blue, green, red order with padding', () => {
        const pixels = Array.from(encodeBmp24(rgb, 3, 2).slice(BMP_HEADER_BYTES));
        expect(pixels).toEqual([255, 255, 255, 0, 0, 0, 128, 128, 128, 0, 0, 0, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0]);
    });

    it('needs no padding when a row is a multiple of 4 bytes', () => {
        expect(encodeBmp24(new Uint8Array(4 * 3), 4, 1).length).toBe(BMP_HEADER_BYTES + 12);
    });

    it('refuses pixels that do not fit the size', () => {
        expect(() => encodeBmp24(new Uint8Array(5), 2, 1)).toThrow();
        expect(() => encodeBmp24(new Uint8Array(0), 0, 0)).toThrow();
    });
});

describe('readBmpSize', () => {
    it('reads the size back', () => {
        expect(readBmpSize(encodeBmp24(new Uint8Array(160 * 32 * 3), 160, 32))).toEqual({ width: 160, height: 32 });
    });

    it('gives null for bytes that are not a 24-bit BMP', () => {
        expect(readBmpSize(new Uint8Array(10))).toBeNull();
        expect(readBmpSize(new Uint8Array(60))).toBeNull();
    });
});
