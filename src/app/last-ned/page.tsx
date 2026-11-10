import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { InstallSteps } from '@/components/download/InstallSteps';
import styles from '@/components/download/download.module.css';
import { DOWNLOAD_TEXT as T, downloadText, systemName, versionLine } from '@/components/download/text';
import p from '@/components/player/player.module.css';
import { siteHeader } from '@/components/site/header';
import { SiteShell } from '@/components/site/SiteShell';
import s from '@/components/site/site.module.css';
import { getPool } from '@/lib/db';
import { macAppName, type GameOs, type GamePackage } from '@/lib/game-release/assets';
import { detectOs } from '@/lib/game-release/platform';
import { getLatestRelease, RELEASES_PAGE } from '@/lib/game-release/release';
import { getActiveEvent } from '@/lib/store/events';

export const metadata: Metadata = { title: 'Last ned · Blobby Volley Tournament' };

const OS_ORDER: GameOs[] = ['windows', 'macos', 'linux'];

/** The line under each download button. */
const GAME_TITLE = 'Blobby Volley 2 Tournament';

function PackageCard({ pkg }: { pkg: GamePackage }) {
    return (
        <li className={styles.card}>
            <span className={styles.cardTitle}>{systemName(pkg.os, pkg.arch)}</span>
            <span className={styles.cardMeta}>{GAME_TITLE}</span>
            <a href={pkg.url} className={styles.cardButton} aria-label={downloadText(pkg)}>
                Last ned
            </a>
        </li>
    );
}

/** The download page of the game. The latest release comes from GitHub on the server, never from the browser. */
export default async function DownloadPage() {
    const [agent, release, header] = await Promise.all([
        headers().then((h) => h.get('user-agent')),
        getLatestRelease(),
        getActiveEvent(getPool()).then((event) => siteHeader(event)),
    ]);
    const os = detectOs(agent);
    const packages = release?.packages ?? [];
    const mine = os ? packages.filter((pkg) => pkg.os === os) : [];
    const others = packages.filter((pkg) => !mine.includes(pkg));
    const installOrder = os ? [os, ...OS_ORDER.filter((o) => o !== os)] : OS_ORDER;
    const linuxFile = packages.find((pkg) => pkg.os === 'linux')?.name;
    const macApp = macAppName(packages.find((pkg) => pkg.os === 'macos')?.name);

    return (
        <SiteShell {...header} current="/last-ned">
            <section className={s.hero} aria-labelledby="tittel">
                <div className={s.heroText}>
                    {release && <p className={s.heroDates}>{versionLine(release.version, release.publishedAt)}</p>}
                    <h1 id="tittel" className={`${s.heroTitle} ${styles.title}`}>
                        {T.title}
                    </h1>
                    <p className={s.heroPitch}>{T.pitch}</p>
                    {packages.length === 0 ? (
                        <>
                            <p className={s.heroPitch}>{T.noRelease}</p>
                            <div className={s.heroActions}>
                                <a href={release?.pageUrl ?? RELEASES_PAGE} className={p.joinButton}>
                                    {T.noReleaseLink}
                                </a>
                            </div>
                        </>
                    ) : mine.length > 0 ? (
                        <div className={styles.primary}>
                            {mine.map((pkg, i) => (
                                <div key={pkg.name} className={styles.primaryItem}>
                                    <a href={pkg.url} className={i === 0 ? p.joinButton : s.heroSecondary}>
                                        {downloadText(pkg)}
                                    </a>
                                    <span className={styles.primaryMeta}>{GAME_TITLE}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className={s.heroPitch}>{T.pickSystem}</p>
                    )}
                </div>
            </section>

            {others.length > 0 && (
                <section className={`${p.wide} ${styles.section}`} aria-labelledby="system">
                    <h2 id="system" className={p.h2}>
                        {mine.length > 0 ? T.otherSystems : T.allSystems}
                    </h2>
                    <ul className={styles.cards}>
                        {others.map((pkg) => (
                            <PackageCard key={pkg.name} pkg={pkg} />
                        ))}
                    </ul>
                </section>
            )}

            <section className={`${p.column} ${styles.section}`} aria-labelledby="installer">
                <h2 id="installer" className={p.h2}>
                    {T.install}
                </h2>
                {installOrder.map((o) => (
                    <InstallSteps key={o} os={o} linuxFile={linuxFile} macApp={macApp} />
                ))}
            </section>

            <aside className={p.aside}>
                <section className={`${p.panel} ${p.panelYellow}`} aria-labelledby="kamp">
                    <h2 id="kamp" className={p.h2}>
                        {T.join}
                    </h2>
                    <ol className={styles.steps}>
                        <li>
                            Kopier lenkjå på <Link href="/me">sidå di</Link> når kampen din e klar.
                        </li>
                        <li>Opne Blobby Volley.</li>
                        <li>Trykk på &quot;join link&quot; øvst i hovudmenyen.</li>
                        <li>Trykk &quot;join&quot; eller Enter.</li>
                    </ol>
                    <p className={styles.note}>På Mac opne ikkje blobby://-lenkjer spelet ennå. Bruk &quot;join link&quot;-knappen i spelet.</p>
                </section>
                {release && release.scripts.length > 0 && (
                    <section className={p.panel} aria-labelledby="server">
                        <h2 id="server" className={p.h2}>
                            {T.server}
                        </h2>
                        <p className={styles.note}>{T.serverText}</p>
                        <ul className={styles.scripts}>
                            {release.scripts.map((script) => (
                                <li key={script.name}>
                                    <a href={script.url}>{script.name}</a>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </aside>
        </SiteShell>
    );
}
