// The sign-up QR code, drawn on the server as one SVG path. lean-qr does the encoding.
import { correction, generate } from 'lean-qr';
import { toSvgPath } from 'lean-qr/extras/svg';

export interface QrCode {
    /** The width and height in modules, without the quiet zone. */
    size: number;
    /** The dark modules, for the `d` attribute of a path in a `0 0 size size` view box. */
    path: string;
}

/** The QR code for a text, such as the sign-up address. Medium error correction, so a glare on the TV does not stop a scan. */
export function qrCode(text: string): QrCode {
    const code = generate(text, { minCorrectionLevel: correction.M });
    return { size: code.size, path: toSvgPath(code) };
}

/** The sign-up address for the QR code, from NEXTAUTH_URL, the public address of the site. Null when it is not set. */
export function joinUrl(env: Record<string, string | undefined>): string | null {
    if (!env.NEXTAUTH_URL) return null;
    try {
        return new URL('/join', env.NEXTAUTH_URL).toString();
    } catch {
        return null;
    }
}
