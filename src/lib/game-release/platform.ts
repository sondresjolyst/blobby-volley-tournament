import type { GameOs } from './assets';

/**
 * The system of a visitor from the User-Agent header, or null when it is not one the game runs on.
 * A Mac browser does not tell Apple Silicon from Intel, so the page offers both for macOS.
 */
export function detectOs(userAgent: string | null | undefined): GameOs | null {
    if (!userAgent) return null;
    // Phones and tablets name the desktop system too, so they are ruled out first.
    if (/Android|iPhone|iPad|iPod|Mobile|CrOS/i.test(userAgent)) return null;
    if (/Windows NT/i.test(userAgent)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos';
    if (/Linux|X11/i.test(userAgent)) return 'linux';
    return null;
}
