import { sortAssets, type GamePackage, type ReleaseAsset, type ServerScript } from './assets';

const REPO = 'sondresjolyst/blobbyvolley2-tournament';

/** The releases page of the game, the way to the files when GitHub does not answer. */
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

const API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Only files of the game repository are offered for download. */
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

/** How long a read release is kept, in seconds. */
export const RELEASE_REVALIDATE = 600;
const TIMEOUT_MS = 5000;

export interface GameRelease {
    version: string;
    /** When it was published, as an ISO time, or null. */
    publishedAt: string | null;
    /** The page of this release on GitHub. */
    pageUrl: string;
    packages: GamePackage[];
    scripts: ServerScript[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function readAsset(value: unknown): ReleaseAsset | null {
    if (!isRecord(value)) return null;
    const { name, browser_download_url: url, size } = value;
    if (typeof name !== 'string' || typeof url !== 'string' || !url.startsWith(DOWNLOAD_PREFIX)) return null;
    return { name, url, size: typeof size === 'number' && size >= 0 ? size : 0 };
}

/** The release in a GitHub answer, or null when the answer is not one. */
export function readRelease(body: unknown): GameRelease | null {
    if (!isRecord(body) || typeof body.tag_name !== 'string' || !Array.isArray(body.assets)) return null;
    const assets = body.assets.map(readAsset).filter((a) => a !== null);
    const { packages, scripts } = sortAssets(assets);
    const page = typeof body.html_url === 'string' && body.html_url.startsWith(`https://github.com/${REPO}/releases/`) ? body.html_url : RELEASES_PAGE;
    return {
        version: body.tag_name.replace(/^v/, ''),
        publishedAt: typeof body.published_at === 'string' ? body.published_at : null,
        pageUrl: page,
        packages,
        scripts,
    };
}

/**
 * The latest game release, read from GitHub on the server and kept for 10 minutes. Null when GitHub
 * cannot be reached, answers with an error or sends something else, so the page links to the releases page.
 * GAME_RELEASE_API_URL points the read at a fixture in the end-to-end tests.
 */
export async function getLatestRelease(env: Record<string, string | undefined> = process.env): Promise<GameRelease | null> {
    try {
        const res = await fetch(env.GAME_RELEASE_API_URL || API, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'blobby-volley-tournament', 'X-GitHub-Api-Version': '2022-11-28' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
            next: { revalidate: RELEASE_REVALIDATE },
        });
        if (!res.ok) return null;
        return readRelease(await res.json());
    } catch {
        return null;
    }
}
