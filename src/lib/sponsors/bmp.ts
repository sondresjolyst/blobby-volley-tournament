// Writes and reads the 24-bit BMP files the game shows. Only the plain uncompressed form is used.

const FILE_HEADER = 14;
const INFO_HEADER = 40;
export const BMP_HEADER_BYTES = FILE_HEADER + INFO_HEADER;
// 72 dots per inch in pixels per metre. The game ignores it.
const PIXELS_PER_METRE = 2835;

/** Each row is padded to a multiple of 4 bytes. */
const rowBytes = (width: number) => Math.ceil((width * 3) / 4) * 4;

/**
 * Encodes RGB pixels, 3 bytes each, row by row from the top, as a 24-bit BMP. The file stores the
 * rows from the bottom up in blue, green, red order, which is what a BMP with a positive height means.
 */
export function encodeBmp24(rgb: Uint8Array, width: number, height: number): Uint8Array {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('A BMP needs a width and a height of at least 1');
    if (rgb.length !== width * height * 3) throw new Error('The pixels do not fit the width and the height');
    const stride = rowBytes(width);
    const size = BMP_HEADER_BYTES + stride * height;
    const bmp = new Uint8Array(size);
    const view = new DataView(bmp.buffer);
    bmp[0] = 0x42;
    bmp[1] = 0x4d;
    view.setUint32(2, size, true);
    view.setUint32(10, BMP_HEADER_BYTES, true);
    view.setUint32(14, INFO_HEADER, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    // Compression 0 means none.
    view.setUint32(30, 0, true);
    view.setUint32(34, stride * height, true);
    view.setInt32(38, PIXELS_PER_METRE, true);
    view.setInt32(42, PIXELS_PER_METRE, true);
    for (let y = 0; y < height; y++) {
        const target = BMP_HEADER_BYTES + (height - 1 - y) * stride;
        for (let x = 0; x < width; x++) {
            const source = (y * width + x) * 3;
            bmp[target + x * 3] = rgb[source + 2];
            bmp[target + x * 3 + 1] = rgb[source + 1];
            bmp[target + x * 3 + 2] = rgb[source];
        }
    }
    return bmp;
}

/** The width and the height of a BMP written by encodeBmp24, or null when the bytes are not one. */
export function readBmpSize(bmp: Uint8Array): { width: number; height: number } | null {
    if (bmp.length < BMP_HEADER_BYTES || bmp[0] !== 0x42 || bmp[1] !== 0x4d) return null;
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    const width = view.getInt32(18, true);
    const height = view.getInt32(22, true);
    if (width < 1 || height < 1 || view.getUint16(28, true) !== 24) return null;
    return { width, height };
}
