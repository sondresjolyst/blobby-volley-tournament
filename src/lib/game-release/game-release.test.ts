import { afterEach, describe, expect, it, vi } from 'vitest';
import { packageOf, sortAssets } from './assets';
import { detectOs } from './platform';
import { getLatestRelease, readRelease, RELEASES_PAGE } from './release';

const DOWNLOAD = 'https://github.com/sondresjolyst/blobbyvolley2-tournament/releases/download/v0.1.0/';
const asset = (name: string, size = 1000) => ({ name, url: DOWNLOAD + name, size });

describe('packageOf', () => {
    it.each([
        ['blobby-volley-2-0.1.0-windows-x64.zip', 'windows', 'x64'],
        ['blobby-volley-2-0.1.0-macos-arm64.zip', 'macos', 'arm64'],
        ['blobby-volley-2-0.1.0-macos-x64.zip', 'macos', 'x64'],
        ['blobby-volley-2-0.1.0-linux-x64.tar.gz', 'linux', 'x64'],
        ['blobbyvolley2-tournament-0.1.1-windows-x64.zip', 'windows', 'x64'],
        ['blobbyvolley2-tournament-0.1.1-macos-arm64.zip', 'macos', 'arm64'],
        ['blobbyvolley2-tournament-0.1.1-linux-x64.tar.gz', 'linux', 'x64'],
        ['blobbyvolley2-tournament-0.2.0-rc.1-linux-x64.tar.gz', 'linux', 'x64'],
    ])('reads %s', (name, os, arch) => {
        expect(packageOf(asset(name))).toMatchObject({ os, arch, name });
    });

    it.each([
        'tournament-server.ps1',
        'tournament-server.sh',
        'checksums.txt',
        'blobby-volley-2-0.1.0-windows-x64.tar.gz',
        'blobby-volley-2-0.1.0-linux-x64.zip',
        'blobby-volley-2-0.1.0-freebsd-x64.zip',
        'other-game-0.1.0-windows-x64.zip',
        'blobbyvolley2-tournament-0.1.1-windows-x64.zip.sig',
    ])('leaves out %s', (name) => {
        expect(packageOf(asset(name))).toBeNull();
    });
});

describe('sortAssets', () => {
    it('lists the packages in a fixed order, keeps the server scripts apart and drops other files', () => {
        const { packages, scripts } = sortAssets([
            asset('tournament-server.sh'),
            asset('blobby-volley-2-0.1.0-linux-x64.tar.gz'),
            asset('notes.md'),
            asset('blobby-volley-2-0.1.0-macos-x64.zip'),
            asset('tournament-server.ps1'),
            asset('blobby-volley-2-0.1.0-windows-x64.zip'),
            asset('blobby-volley-2-0.1.0-macos-arm64.zip'),
        ]);
        expect(packages.map((p) => `${p.os}-${p.arch}`)).toEqual(['windows-x64', 'macos-arm64', 'macos-x64', 'linux-x64']);
        expect(scripts.map((s) => s.name)).toEqual(['tournament-server.ps1', 'tournament-server.sh']);
    });
});

describe('detectOs', () => {
    it.each([
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'windows'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'macos'],
        ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'linux'],
        ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'linux'],
    ])('finds the system of %s', (agent, os) => {
        expect(detectOs(agent)).toBe(os);
    });

    it.each([
        ['an Android phone', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'],
        ['an iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
        ['an iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
        ['a Chromebook', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'],
        ['no header', null],
        ['an empty header', ''],
        ['a bot', 'curl/8.5.0'],
    ])('shows every system for %s', (_, agent) => {
        expect(detectOs(agent)).toBeNull();
    });
});

const RELEASE = {
    tag_name: 'v0.1.0',
    html_url: 'https://github.com/sondresjolyst/blobbyvolley2-tournament/releases/tag/v0.1.0',
    published_at: '2026-11-08T18:30:00Z',
    assets: [
        { name: 'blobby-volley-2-0.1.0-windows-x64.zip', size: 31457280, browser_download_url: `${DOWNLOAD}blobby-volley-2-0.1.0-windows-x64.zip` },
        { name: 'tournament-server.sh', size: 15360, browser_download_url: `${DOWNLOAD}tournament-server.sh` },
        // A file from somewhere else is never offered.
        { name: 'blobby-volley-2-0.1.0-linux-x64.tar.gz', size: 1, browser_download_url: 'https://evil.test/blobby-volley-2-0.1.0-linux-x64.tar.gz' },
    ],
};

describe('readRelease', () => {
    it('reads the version, the date, the packages and the scripts', () => {
        const release = readRelease(RELEASE);
        expect(release).toMatchObject({ version: '0.1.0', publishedAt: '2026-11-08T18:30:00Z', pageUrl: RELEASE.html_url });
        expect(release?.packages.map((p) => p.name)).toEqual(['blobby-volley-2-0.1.0-windows-x64.zip']);
        expect(release?.packages[0].size).toBe(31457280);
        expect(release?.scripts.map((s) => s.name)).toEqual(['tournament-server.sh']);
    });

    it('refuses an answer that is not a release', () => {
        expect(readRelease(null)).toBeNull();
        expect(readRelease({ message: 'Not Found' })).toBeNull();
        expect(readRelease({ tag_name: 'v1', assets: 'none' })).toBeNull();
    });

    it('links to the releases page when the page address is not of the game repository', () => {
        expect(readRelease({ ...RELEASE, html_url: 'https://evil.test/' })?.pageUrl).toBe(RELEASES_PAGE);
    });
});

describe('getLatestRelease', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the latest release from GitHub, kept for 10 minutes and with a timeout', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(RELEASE), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const release = await getLatestRelease({});
        expect(release?.version).toBe('0.1.0');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.github.com/repos/sondresjolyst/blobbyvolley2-tournament/releases/latest');
        expect(init.next).toEqual({ revalidate: 600 });
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('reads from GAME_RELEASE_API_URL when it is set', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(RELEASE), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        await getLatestRelease({ GAME_RELEASE_API_URL: 'http://127.0.0.1:3101/releases/latest' });
        expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:3101/releases/latest');
    });

    it.each([
        ['GitHub answers with an error', () => Promise.resolve(new Response('{"message":"API rate limit exceeded"}', { status: 403 }))],
        ['GitHub cannot be reached', () => Promise.reject(new TypeError('fetch failed'))],
        ['the request times out', () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))],
        ['the answer is not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ])('gives null when %s', async (_, answer) => {
        vi.stubGlobal('fetch', vi.fn(answer));
        expect(await getLatestRelease({})).toBeNull();
    });
});
