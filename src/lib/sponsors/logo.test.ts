import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';
import { BMP_HEADER_BYTES, readBmpInfo } from './bmp';
import { checkLogo, gameLogoWidth, makeGameLogo, MAX_LOGO_BYTES, sniffLogoType, type CheckedLogo } from './logo';

type Rgba = { r: number; g: number; b: number; alpha: number };

const image = (width: number, height: number, background: Rgba = { r: 200, g: 0, b: 0, alpha: 1 }) => sharp({ create: { width, height, channels: 4, background } });
const bytes = async (img: Sharp) => new Uint8Array(await img.toBuffer());
const png = (width: number, height: number, background?: Rgba) => bytes(image(width, height, background).png());

async function checked(data: Uint8Array): Promise<CheckedLogo> {
    const result = await checkLogo(data);
    if (!result.ok) throw new Error(result.error);
    return result.value;
}

/** The colour of a pixel of a 32-bit BMP, counted from the top left, as [r, g, b, alpha]. */
function pixel(bmp: Uint8Array, x: number, y: number): number[] {
    const { width, height } = readBmpInfo(bmp)!;
    const at = BMP_HEADER_BYTES + (height - 1 - y) * width * 4 + x * 4;
    return [bmp[at + 2], bmp[at + 1], bmp[at], bmp[at + 3]];
}

const size = (bmp: Uint8Array) => {
    const info = readBmpInfo(bmp);
    return info && { width: info.width, height: info.height };
};

const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');

describe('sniffLogoType', () => {
    it('knows PNG, JPEG and WebP by their first bytes', async () => {
        expect(sniffLogoType(await png(4, 4))).toBe('image/png');
        expect(sniffLogoType(await bytes(image(4, 4).jpeg()))).toBe('image/jpeg');
        expect(sniffLogoType(await bytes(image(4, 4).webp()))).toBe('image/webp');
    });

    it('refuses SVG, GIF and anything else', async () => {
        expect(sniffLogoType(SVG)).toBeNull();
        expect(sniffLogoType(await bytes(image(4, 4).gif()))).toBeNull();
        expect(sniffLogoType(new TextEncoder().encode('<html><body>hi</body></html>'))).toBeNull();
        expect(sniffLogoType(new Uint8Array())).toBeNull();
        // RIFF without WEBP is another format, such as WAV.
        expect(sniffLogoType(new TextEncoder().encode('RIFF\0\0\0\0WAVEfmt '))).toBeNull();
    });
});

describe('checkLogo', () => {
    it('accepts PNG, JPEG and WebP and gives their size', async () => {
        for (const data of [await png(300, 100), await bytes(image(300, 100).jpeg()), await bytes(image(300, 100).webp())]) {
            const logo = await checked(data);
            expect(logo).toMatchObject({ width: 300, height: 100 });
            expect(sniffLogoType(logo.bytes)).toBe(sniffLogoType(data));
        }
    });

    it('stores a JPEG without its EXIF data, turned upright and in sRGB', async () => {
        const photo = await bytes(
            image(100, 50)
                .jpeg()
                .withMetadata({ orientation: 6 })
                .withExifMerge({ IFD0: { Artist: 'Secret Person' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '59/1 54/1 0/1' } })
                .withIccProfile('p3'),
        );
        const before = await sharp(photo).metadata();
        expect(before).toMatchObject({ orientation: 6, exif: expect.anything(), icc: expect.anything() });
        expect(Buffer.from(photo).includes('Secret Person')).toBe(true);
        const logo = await checked(photo);
        const after = await sharp(logo.bytes).metadata();
        expect(after).toMatchObject({ format: 'jpeg', width: 50, height: 100, space: 'srgb' });
        expect(after.exif).toBeUndefined();
        expect(after.icc).toBeUndefined();
        expect(after.orientation).toBeUndefined();
        expect(Buffer.from(logo.bytes).includes('Secret Person')).toBe(false);
        expect(logo).toMatchObject({ type: 'image/jpeg', width: 50, height: 100 });
    });

    it('stores PNG and WebP without metadata too', async () => {
        for (const data of [await bytes(image(20, 10).png().withExif({ IFD0: { Artist: 'Secret Person' } })), await bytes(image(20, 10).webp().withExif({ IFD0: { Artist: 'Secret Person' } }))]) {
            expect((await sharp(data).metadata()).exif).toBeDefined();
            const logo = await checked(data);
            expect((await sharp(logo.bytes).metadata()).exif).toBeUndefined();
            expect(Buffer.from(logo.bytes).includes('Secret Person')).toBe(false);
        }
    });

    it('refuses an empty file and a file over 1 MB', async () => {
        expect(await checkLogo(new Uint8Array())).toEqual({ ok: false, error: 'logo-size' });
        const large = new Uint8Array(MAX_LOGO_BYTES + 1);
        large.set(await png(4, 4));
        expect(await checkLogo(large)).toEqual({ ok: false, error: 'logo-size' });
    });

    it('refuses SVG and GIF whatever the browser said', async () => {
        expect(await checkLogo(SVG)).toEqual({ ok: false, error: 'logo-type' });
        expect(await checkLogo(await bytes(image(4, 4).gif()))).toEqual({ ok: false, error: 'logo-type' });
    });

    it('refuses a file that only starts like an image', async () => {
        const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...SVG]);
        expect(await checkLogo(fake)).toEqual({ ok: false, error: 'logo-image' });
        // A JPEG header on PNG data.
        const mixed = await png(4, 4);
        mixed.set([0xff, 0xd8, 0xff]);
        expect(await checkLogo(mixed)).toEqual({ ok: false, error: 'logo-image' });
    });

    it('refuses a cut off image', async () => {
        const whole = await bytes(image(400, 400, { r: 10, g: 20, b: 30, alpha: 1 }).jpeg());
        expect(await checkLogo(whole.slice(0, Math.floor(whole.length / 2)))).toEqual({ ok: false, error: 'logo-image' });
    });

    it('refuses a logo with a side over 2000 pixels', async () => {
        expect(await checkLogo(await png(2001, 10))).toEqual({ ok: false, error: 'logo-dimensions' });
        expect(await checkLogo(await png(10, 2001))).toEqual({ ok: false, error: 'logo-dimensions' });
        expect((await checkLogo(await png(2000, 2000))).ok).toBe(true);
    });
});

describe('gameLogoWidth', () => {
    it.each([
        [100, 100, 32],
        [300, 100, 96],
        [500, 100, 160],
        [5000, 10, 160],
        [1, 2000, 1],
    ])('is %i x %i -> %i', (width, height, expected) => {
        expect(gameLogoWidth(width, height)).toBe(expected);
    });
});

describe('makeGameLogo', () => {
    it('makes a 32-bit BMP with alpha 32 pixels high with the aspect ratio kept', async () => {
        const bmp = await makeGameLogo(await checked(await png(300, 100)), null);
        expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
        expect(readBmpInfo(bmp)).toEqual({ width: 96, height: 32, bitsPerPixel: 32 });
        expect(bmp.length).toBe(BMP_HEADER_BYTES + 96 * 4 * 32);
        expect(pixel(bmp, 50, 16)).toEqual([200, 0, 0, 255]);
    });

    it('keeps transparent parts transparent without a background', async () => {
        const clear = await checked(await png(64, 64, { r: 0, g: 0, b: 0, alpha: 0 }));
        expect(pixel(await makeGameLogo(clear, null), 10, 10)[3]).toBe(0);
        const half = await checked(await png(64, 64, { r: 0, g: 0, b: 255, alpha: 0.5 }));
        const [, , blue, alpha] = pixel(await makeGameLogo(half, null), 10, 10);
        expect(blue).toBe(255);
        expect(alpha).toBeGreaterThan(120);
        expect(alpha).toBeLessThan(136);
    });

    it('caps the width at 160 and centres a wide logo on a transparent band', async () => {
        const bmp = await makeGameLogo(await checked(await png(1000, 50)), null);
        expect(size(bmp)).toEqual({ width: 160, height: 32 });
        expect(pixel(bmp, 80, 0)[3]).toBe(0);
        expect(pixel(bmp, 80, 16)).toEqual([200, 0, 0, 255]);
        expect(pixel(bmp, 80, 31)[3]).toBe(0);
    });

    it('puts the logo on an own background, opaque everywhere', async () => {
        const clear = await checked(await png(64, 64, { r: 0, g: 0, b: 0, alpha: 0 }));
        expect(pixel(await makeGameLogo(clear, '#ffffff'), 10, 10)).toEqual([255, 255, 255, 255]);
        expect(pixel(await makeGameLogo(clear, '#102030'), 10, 10)).toEqual([16, 32, 48, 255]);
        const wide = await makeGameLogo(await checked(await png(1000, 50)), '#00ff00');
        expect(pixel(wide, 80, 0)).toEqual([0, 255, 0, 255]);
        expect(pixel(wide, 80, 16)).toEqual([200, 0, 0, 255]);
    });

    it('scales a small logo up and handles grey and JPEG input', async () => {
        const grey = await bytes(image(8, 4).greyscale().png());
        expect(size(await makeGameLogo(await checked(grey), null))).toEqual({ width: 64, height: 32 });
        const jpeg = await makeGameLogo(await checked(await bytes(image(40, 40).jpeg())), null);
        expect(size(jpeg)).toEqual({ width: 32, height: 32 });
        expect(pixel(jpeg, 10, 10)[3]).toBe(255);
    });

    it('never decodes SVG, even when the check is skipped', async () => {
        await expect(makeGameLogo({ bytes: SVG, type: 'image/png', width: 10, height: 10 }, null)).rejects.toThrow();
    });
});
