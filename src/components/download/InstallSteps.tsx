import type { GameOs } from '@/lib/game-release/assets';
import styles from './download.module.css';

const q = (text: string) => <span className={styles.ui}>{text}</span>;

/** How to unpack and start the game on one system, from the README of the game. */
export function InstallSteps({ os, linuxFile, macApp }: { os: GameOs; linuxFile?: string; macApp: string }) {
    if (os === 'windows') {
        return (
            <section className={styles.install} aria-labelledby="install-windows">
                <h3 id="install-windows" className={styles.h3}>
                    Windows
                </h3>
                <ol className={styles.steps}>
                    <li>Pakk ut zip-fila.</li>
                    <li>Dobbeltklikk på {q('blobby.exe')} i mappå.</li>
                    <li>
                        Kjem {q('Windows protected your PC')}? Spelet e ikkje signert ennå. Trykk {q('More info')} og så {q('Run anyway')}.
                    </li>
                </ol>
                <p className={styles.note}>
                    Eller: høgreklikk på zip-fila før du pakke ut, velg {q('Properties')}, kryss av for {q('Unblock')} og trykk {q('OK')}.
                </p>
            </section>
        );
    }
    if (os === 'macos') {
        return (
            <section className={styles.install} aria-labelledby="install-macos">
                <h3 id="install-macos" className={styles.h3}>
                    Mac
                </h3>
                <ol className={styles.steps}>
                    <li>Dobbeltklikk på zip-fila, så pakke Macen den ut.</li>
                    <li>
                        Appen e ikkje signert hos Apple ennå, så macOS stoppe første start. Høgreklikk på {q(macApp)}, velg {q('Open')} og trykk {q('Open')} igjen.
                    </li>
                    <li>
                        Ser du ingen {q('Open')}-knapp? Gå te {q('System Settings')}, {q('Privacy & Security')} og trykk {q('Open Anyway')}.
                    </li>
                    <li>Etterpå starte du spelet med dobbeltklikk. Du kan flytta det te {q('Applications')}.</li>
                </ol>
                <p className={styles.note}>Spelet treng macOS 15 eller nyare. Ein Mac med M1 eller nyare tar den eine fila, ein Mac med Intel den andre.</p>
            </section>
        );
    }
    return (
        <section className={styles.install} aria-labelledby="install-linux">
            <h3 id="install-linux" className={styles.h3}>
                Linux
            </h3>
            <ol className={styles.steps}>
                <li>
                    Pakk ut fila: <code className={styles.code}>tar -xzf {linuxFile ?? 'fila.tar.gz'}</code>
                </li>
                <li>
                    Gå inn i mappå du fekk, og start spelet med <code className={styles.code}>./blobby</code>
                </li>
            </ol>
            <p className={styles.note}>Spelet e bygd på Ubuntu 22.04 og går på den og nyare distroa.</p>
        </section>
    );
}
