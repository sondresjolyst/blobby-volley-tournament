// Writes the 32-bit BMP files with alpha the game shows, and reads their headers. The game logos
// stored before version 0010 are 24-bit, so the reader takes those too.

const FILE_HEADER = 14;
/** BITMAPV4HEADER, which holds the colour masks and so the alpha channel. */
const V4_HEADER = 108;
export const BMP_HEADER_BYTES = FILE_HEADER + V4_HEADER;
// 72 dots per inch in pixels per metre. The game ignores it.
const PIXELS_PER_METRE = 2835;
/** BI_BITFIELDS: the pixels are read through the masks. */
const BI_BITFIELDS = 3;
/** LCS_sRGB, the letters sRGB as a little-endian number. */
const LCS_SRGB = 0x73524742;

export const RED_MASK = 0x00ff0000;
export const GREEN_MASK = 0x0000ff00;
export const BLUE_MASK = 0x000000ff;
export const ALPHA_MASK = 0xff000000;

/**
 * Encodes RGBA pixels, 4 bytes each, row by row from the top, as a 32-bit BMP with alpha. The
 * file stores the rows from the bottom up in blue, green, red, alpha order, which is what the
 * masks and a positive height mean. A row of 4 byte pixels needs no padding.
 */
export function encodeBmp32(rgba: Uint8Array, width: number, height: number): Uint8Array {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('A BMP needs a width and a height of at least 1');
    if (rgba.length !== width * height * 4) throw new Error('The pixels do not fit the width and the height');
    const stride = width * 4;
    const size = BMP_HEADER_BYTES + stride * height;
    const bmp = new Uint8Array(size);
    const view = new DataView(bmp.buffer);
    bmp[0] = 0x42;
    bmp[1] = 0x4d;
    view.setUint32(2, size, true);
    view.setUint32(10, BMP_HEADER_BYTES, true);
    view.setUint32(14, V4_HEADER, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 32, true);
    view.setUint32(30, BI_BITFIELDS, true);
    view.setUint32(34, stride * height, true);
    view.setInt32(38, PIXELS_PER_METRE, true);
    view.setInt32(42, PIXELS_PER_METRE, true);
    // Colours used and important colours stay 0.
    view.setUint32(54, RED_MASK, true);
    view.setUint32(58, GREEN_MASK, true);
    view.setUint32(62, BLUE_MASK, true);
    view.setUint32(66, ALPHA_MASK, true);
    view.setUint32(70, LCS_SRGB, true);
    // The end points and the gamma are unused with sRGB and stay 0.
    for (let y = 0; y < height; y++) {
        const target = BMP_HEADER_BYTES + (height - 1 - y) * stride;
        for (let x = 0; x < width; x++) {
            const source = (y * width + x) * 4;
            bmp[target + x * 4] = rgba[source + 2];
            bmp[target + x * 4 + 1] = rgba[source + 1];
            bmp[target + x * 4 + 2] = rgba[source];
            bmp[target + x * 4 + 3] = rgba[source + 3];
        }
    }
    return bmp;
}

export interface BmpInfo {
    width: number;
    height: number;
    bitsPerPixel: 24 | 32;
}

/** The size and bits per pixel of a 32-bit or 24-bit BMP made by this site, or null when the bytes are not one. */
export function readBmpInfo(bmp: Uint8Array): BmpInfo | null {
    if (bmp.length < 54 || bmp[0] !== 0x42 || bmp[1] !== 0x4d) return null;
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    const width = view.getInt32(18, true);
    const height = view.getInt32(22, true);
    const bitsPerPixel = view.getUint16(28, true);
    if (width < 1 || height < 1) return null;
    if (bitsPerPixel === 24 && view.getUint32(30, true) === 0) return { width, height, bitsPerPixel };
    if (bitsPerPixel === 32 && bmp.length >= BMP_HEADER_BYTES && view.getUint32(14, true) === V4_HEADER && view.getUint32(30, true) === BI_BITFIELDS) return { width, height, bitsPerPixel };
    return null;
}
