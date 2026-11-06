// Checks uploaded sponsor logos and makes the small BMP the game shows. sharp does the decoding.
import sharp, { type Metadata } from 'sharp';
import { encodeBmp24 } from './bmp';

export type LogoType = 'image/png' | 'image/jpeg' | 'image/webp';

export const MAX_LOGO_BYTES = 1024 * 1024;
/** The longest side of an uploaded logo, in pixels. */
export const MAX_LOGO_SIDE = 2000;
export const GAME_LOGO_HEIGHT = 32;
export const GAME_LOGO_MAX_WIDTH = 160;

// Only the PNG, JPEG and WebP decoders may run, whatever bytes reach sharp. libvips can also read
// SVG, PDF and other formats, and those are a far larger attack surface.
sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({ operation: ['VipsForeignLoadPngBuffer', 'VipsForeignLoadJpegBuffer', 'VipsForeignLoadWebpBuffer'] });
// Uploads are rare, so nothing is kept in memory between them.
sharp.cache(false);

const SHARP_FORMAT: Record<LogoType, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };

const startsWith = (bytes: Uint8Array, prefix: readonly number[], offset = 0) => prefix.every((byte, i) => bytes[offset + i] === byte);

/** The type the first bytes of a file show. SVG and every other format give null. */
export function sniffLogoType(bytes: Uint8Array): LogoType | null {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    // RIFF, 4 bytes of length, then WEBP.
    if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
    return null;
}

/** The width of the game logo for a logo of this size. It keeps the aspect ratio up to the widest the game allows. */
export function gameLogoWidth(width: number, height: number): number {
    return Math.min(GAME_LOGO_MAX_WIDTH, Math.max(1, Math.round((width * GAME_LOGO_HEIGHT) / height)));
}

export interface CheckedLogo {
    bytes: Uint8Array;
    type: LogoType;
    /** The size as shown, after the EXIF orientation is applied. */
    width: number;
    height: number;
}

export type LogoError = 'logo-size' | 'logo-type' | 'logo-image' | 'logo-dimensions';

const decoder = (bytes: Uint8Array) => sharp(bytes, { limitInputPixels: MAX_LOGO_SIDE * MAX_LOGO_SIDE, failOn: 'warning' });

/**
 * Checks an uploaded logo: at most MAX_LOGO_BYTES, a PNG, JPEG or WebP by its first bytes, a
 * single image that decodes, and no side longer than MAX_LOGO_SIDE. The type sent by the browser
 * is never trusted.
 */
export async function checkLogo(bytes: Uint8Array): Promise<{ ok: true; value: CheckedLogo } | { ok: false; error: LogoError }> {
    if (bytes.length < 1 || bytes.length > MAX_LOGO_BYTES) return { ok: false, error: 'logo-size' };
    const type = sniffLogoType(bytes);
    if (!type) return { ok: false, error: 'logo-type' };
    let metadata: Metadata;
    try {
        metadata = await decoder(bytes).metadata();
    } catch {
        return { ok: false, error: 'logo-image' };
    }
    if (metadata.format !== SHARP_FORMAT[type] || (metadata.pages ?? 1) > 1) return { ok: false, error: 'logo-image' };
    const { width, height } = metadata.autoOrient;
    if (!(width >= 1 && height >= 1 && width <= MAX_LOGO_SIDE && height <= MAX_LOGO_SIDE)) return { ok: false, error: 'logo-dimensions' };
    // The header can be fine while the pixels are broken, so the whole image is decoded once here.
    try {
        await decoder(bytes).raw().toBuffer();
    } catch {
        return { ok: false, error: 'logo-image' };
    }
    return { ok: true, value: { bytes, type, width, height } };
}

/**
 * Makes the game logo: a 24-bit BMP GAME_LOGO_HEIGHT pixels high and at most GAME_LOGO_MAX_WIDTH
 * wide with the aspect ratio kept. Transparent parts get the background colour, #rrggbb. A logo
 * wider than the game allows is centred on a band of the background colour.
 */
export async function makeGameLogo(logo: CheckedLogo, background: string): Promise<Uint8Array> {
    const width = gameLogoWidth(logo.width, logo.height);
    const { data, info } = await decoder(logo.bytes)
        .autoOrient()
        .flatten({ background })
        .resize({ width, height: GAME_LOGO_HEIGHT, fit: 'contain', background })
        .toColourspace('srgb')
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3 || info.width !== width || info.height !== GAME_LOGO_HEIGHT) throw new Error('The game logo came out in the wrong form');
    return encodeBmp24(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
}
