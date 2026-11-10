import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { ELO_INFO, eloExamples } from '@/components/stats/elo-text';
import { signed } from '@/components/stats/format';
import { siteHeader } from '@/components/site/header';
import { SiteShell } from '@/components/site/SiteShell';
import styles from '@/components/stats/stats.module.css';
import { getPool } from '@/lib/db';
import { ELO_K, ELO_START } from '@/lib/stats/elo';
import { getActiveEvent } from '@/lib/store/events';

export const metadata: Metadata = { title: 'Sånn funke Elo · Blobby Volley Tournament' };

/** How the Elo rating works, with the formula and examples worked out by the rating code. */
export default async function EloPage() {
    // The header reads the active event and the signed in player, so the page is made per request.
    await connection();
    const header = await siteHeader(await getActiveEvent(getPool()));
    const examples = eloExamples();
    return (
        <SiteShell {...header}>
            <div lang="nn" className={`${styles.page} ${styles.prose}`}>
                <h1 className={styles.title}>Sånn funke Elo</h1>
                <p>{ELO_INFO.text}</p>

                <section aria-labelledby="utrekninga" className={styles.section}>
                    <h2 id="utrekninga" className={styles.heading}>
                        Utrekninga
                    </h2>
                    <p>Før kampen finne vi sjansen du har te å vinna:</p>
                    <p className={styles.formula}>
                        sjanse = 1 / (1 + 10<sup>(motstandar − deg) / 400</sup>)
                    </p>
                    <ul className={styles.plainList}>
                        <li>
                            <strong>deg</strong> e Elo-en din før kampen.
                        </li>
                        <li>
                            <strong>motstandar</strong> e Elo-en te motstandaren før kampen.
                        </li>
                        <li>
                            <strong>400</strong> betyr at den som e 400 over, har ti gonge så stor sjanse som den andre.
                        </li>
                        <li>Sjansen e eit tal frå 0 te 1. Lika gode har 0,5 kvar.</li>
                    </ul>
                    <p>Etter kampen flytte poenga seg:</p>
                    <p className={styles.formula}>
                        vinnaren får {ELO_K} × (1 − sjansen te vinnaren)
                        <br />
                        taparen mistar like mange
                    </p>
                    <ul className={styles.plainList}>
                        <li>
                            <strong>{ELO_K}</strong> e det meste ein kamp kan flytta. Ingen kamp gir {ELO_K} poeng eller meir.
                        </li>
                        <li>E du favoritt, e sjansen din stor, så du får lite. E du underdog, e sjansen liten, så du får mykje.</li>
                        <li>Det vinnaren får, mistar taparen. Poenga blir bare flytta, ingen nye kjem te.</li>
                    </ul>
                </section>

                <section aria-labelledby="eksempel" className={styles.section}>
                    <h2 id="eksempel" className={styles.heading}>
                        Eksempel
                    </h2>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col">Kamp</th>
                                    <th scope="col">Vinnar</th>
                                    <th scope="col">Tapar</th>
                                    <th scope="col">Sjanse te vinnaren</th>
                                    <th scope="col">Vinnaren</th>
                                    <th scope="col">Taparen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {examples.map((e) => (
                                    <tr key={e.case}>
                                        <th scope="row">{e.case}</th>
                                        <td>{e.winner}</td>
                                        <td>{e.loser}</td>
                                        <td>{e.chance} %</td>
                                        <td>{signed(e.gain)}</td>
                                        <td>{signed(-e.gain)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className={styles.note}>Tala e runda av te heile poeng, sånn som på topplistå.</p>
                </section>

                <section aria-labelledby="ka-som-telle" className={styles.section}>
                    <h2 id="ka-som-telle" className={styles.heading}>
                        Ka som telle
                    </h2>
                    <ul className={styles.plainList}>
                        <li>Alle starte på {ELO_START}.</li>
                        <li>Bare ferdige kampa som blei spelt, telle. Det gjelde både turneringskampa og 1v1.</li>
                        <li>Heile kampen telle éin gong. Best av 3 e éin kamp, ikkje tre. Sett og poeng i settå endre ingenting.</li>
                        <li>Kampa som blir vunne uten å bli spelt, fordi någen ikkje møtte opp, telle ikkje.</li>
                        <li>Avlyste kampa og trening telle ikkje.</li>
                    </ul>
                </section>

                <section aria-labelledby="fra-lan-te-lan" className={styles.section}>
                    <h2 id="fra-lan-te-lan" className={styles.heading}>
                        Frå LAN te LAN
                    </h2>
                    <p>
                        Elo-en følge nicket ditt. Store og små bokstava e det same. Bruke du same nick neste gong, tar du med deg Elo-en. Topplistå vise Elo, Elo før LANet, endringå
                        og kor mange kampa med Elo du har spelt.
                    </p>
                </section>

                <section aria-labelledby="retta-resultat" className={styles.section}>
                    <h2 id="retta-resultat" className={styles.heading}>
                        Når eit resultat blir retta
                    </h2>
                    <p>
                        Elo blir rekna ut på nytt frå alle resultata kvar gong. Blir eit resultat retta, endre det Elo-en i alle kampa etter, i rett rekkefølge. Kampa går i den
                        rekkefølgen dei starta, LAN for LAN.
                    </p>
                </section>

                <section aria-labelledby="seeding" className={styles.section}>
                    <h2 id="seeding" className={styles.heading}>
                        Seeding
                    </h2>
                    <p>Admin kan seeda ei turnering etter Elo. Den med høgast Elo blir seeda først.</p>
                </section>

                <p className={styles.section}>
                    <Link href="/leaderboard?board=elo">Te Elo-topplistå</Link>
                </p>
            </div>
        </SiteShell>
    );
}
