// The words of the download page, in the jokey Rogaland dialect of the LAN.
import type { GameArch, GameOs, GamePackage } from '@/lib/game-release/assets';

const SYSTEM: Record<string, string> = {
    'windows-x64': 'Windows',
    'windows-arm64': 'Windows på ARM',
    'macos-arm64': 'Mac med M1 eller nyare',
    'macos-x64': 'Mac med Intel',
    'linux-x64': 'Linux',
    'linux-arm64': 'Linux på ARM',
};

/** The name of the system a package is for, such as `Mac med Intel`. */
export const systemName = (os: GameOs, arch: GameArch) => SYSTEM[`${os}-${arch}`] ?? `${os} ${arch}`;

/** The text of a download button, such as `Last ned for Windows`. */
export const downloadText = (p: Pick<GamePackage, 'os' | 'arch'>) => `Last ned for ${systemName(p.os, p.arch)}`;

const MEGABYTES = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 });

/** The size of a file, such as `24,5 MB`. Empty when GitHub did not give one. */
export function fileSize(bytes: number): string {
    if (!(bytes > 0)) return '';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
    return `${MEGABYTES.format(mb)} MB`;
}

const DATE = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' });

/** The version line, such as `Versjon 0.1.1 · 8. november 2026`. */
export function versionLine(version: string, publishedAt: string | null): string {
    const date = publishedAt ? new Date(publishedAt) : null;
    return date && !Number.isNaN(date.getTime()) ? `Versjon ${version} · ${DATE.format(date)}` : `Versjon ${version}`;
}

export const DOWNLOAD_TEXT = {
    title: 'Last ned spelet',
    pickSystem: 'Velg systemet ditt under.',
    otherSystems: 'Andre system',
    allSystems: 'Velg systemet ditt',
    noRelease: 'Me får ikkje tak i den nyaste versjonen akkurat nå. Last ned spelet på GitHub i staden.',
    noReleaseLink: 'Gå te nedlastingane på GitHub',
    install: 'Sånn får du det opp',
    join: 'Sånn kjem du inn i kampen',
    server: 'For serveren',
    serverText: 'Skal du kjøra turneringsserveren? Startskripta ligg her. Admin-sidå forklare resten.',
} as const;
