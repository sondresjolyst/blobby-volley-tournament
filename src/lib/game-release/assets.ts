// Reads the file names of a game release. Up to 0.1.0 the packages are named
// blobby-volley-2-<version>-<os>-<arch>, and from 0.1.1 blobbyvolley2-tournament-<version>-<os>-<arch>.

export type GameOs = 'windows' | 'macos' | 'linux';
export type GameArch = 'x64' | 'arm64';

/** A package of the game for one system. */
export interface GamePackage {
    os: GameOs;
    arch: GameArch;
    name: string;
    url: string;
    size: number;
}

/** A start script of the tournament server. */
export interface ServerScript {
    name: string;
    url: string;
    size: number;
}

export interface ReleaseAsset {
    name: string;
    url: string;
    size: number;
}

const PACKAGE = /^(?:blobby-volley-2|blobbyvolley2-tournament)-.+-(windows|macos|linux)-(x64|arm64)\.(zip|tar\.gz)$/;
const EXTENSION: Record<GameOs, string> = { windows: 'zip', macos: 'zip', linux: 'tar.gz' };
const SERVER_SCRIPTS = new Set(['tournament-server.ps1', 'tournament-server.sh']);

/** The order the packages are listed in. */
const ORDER = ['windows-x64', 'macos-arm64', 'macos-x64', 'linux-x64', 'windows-arm64', 'linux-arm64'];

/** The game package a file name is, or null for any other file. */
export function packageOf(asset: ReleaseAsset): GamePackage | null {
    const match = PACKAGE.exec(asset.name);
    if (!match) return null;
    const os = match[1] as GameOs;
    if (match[3] !== EXTENSION[os]) return null;
    return { os, arch: match[2] as GameArch, name: asset.name, url: asset.url, size: asset.size };
}

/** Splits the files of a release into game packages and server scripts. Every other file is left out. */
export function sortAssets(assets: readonly ReleaseAsset[]): { packages: GamePackage[]; scripts: ServerScript[] } {
    const packages: GamePackage[] = [];
    const scripts: ServerScript[] = [];
    for (const asset of assets) {
        const found = packageOf(asset);
        if (found) {
            if (!packages.some((p) => p.os === found.os && p.arch === found.arch)) packages.push(found);
        } else if (SERVER_SCRIPTS.has(asset.name)) {
            scripts.push({ name: asset.name, url: asset.url, size: asset.size });
        }
    }
    const rank = (p: GamePackage) => {
        const at = ORDER.indexOf(`${p.os}-${p.arch}`);
        return at === -1 ? ORDER.length : at;
    };
    packages.sort((a, b) => rank(a) - rank(b));
    scripts.sort((a, b) => a.name.localeCompare(b.name));
    return { packages, scripts };
}
