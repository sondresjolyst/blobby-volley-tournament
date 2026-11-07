'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { serverRunCommand, SERVER_HELP, START_SCRIPTS, type Shell } from '@/lib/game-server/commands';
import { CopyButton } from '../CopyButton';

const SHELLS: { shell: Shell; label: string }[] = [
    { shell: 'powershell', label: 'PowerShell' },
    { shell: 'bash', label: 'bash' },
];

/**
 * Makes the game server token and shows it once, with the commands that start the game server.
 * The token comes back in the answer to a post, so it is never in an address. It is gone after a reload.
 */
export function GameServerToken({ hasToken, siteUrl, port }: { hasToken: boolean; siteUrl: string | null; port: number }) {
    const router = useRouter();
    const [token, setToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [shell, setShell] = useState<Shell>('powershell');

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/game-server-token', { method: 'POST', body: new FormData(form), cache: 'no-store' });
            const body = (await res.json().catch(() => null)) as { token?: string; error?: string } | null;
            if (!res.ok || typeof body?.token !== 'string') {
                setError(body?.error === 'confirm' ? 'Check the box to confirm the new token.' : 'Could not make a token. Try again.');
                return;
            }
            form.reset();
            setToken(body.token);
            router.refresh();
        } catch {
            setError('Could not reach the site. Try again.');
        } finally {
            setBusy(false);
        }
    }

    const run = token ? serverRunCommand({ siteUrl: siteUrl ?? '<site address>', token, port }, shell) : null;

    return (
        <>
            <form onSubmit={submit}>
                {hasToken && (
                    <label>
                        <input type="checkbox" name="confirm" value="yes" required /> The old token stops working at once
                    </label>
                )}{' '}
                <button type="submit" disabled={busy}>
                    {hasToken ? 'New token' : 'Make a token'}
                </button>
            </form>
            {error && <p role="alert">{error}</p>}
            {token && run && (
                <section aria-labelledby="new-token">
                    <h2 id="new-token">The new token</h2>
                    <p role="status">This is the only time the token shows. Copy it or the start command now. Make a new token if it is lost.</p>
                    <p>
                        <label>
                            Game server token <input type="text" readOnly value={token} size={50} autoComplete="off" spellCheck={false} />
                        </label>{' '}
                        <CopyButton text={token} label="Copy token" noun="token" />
                    </p>
                    <h3>Start the game server</h3>
                    <p>The start script is the easy way. Paste the token when it asks. The steps are above.</p>
                    <p>
                        The alternative is this one line. Run it on the computer for the game server, with Docker installed. It starts the server in tournament mode with this site and the
                        token, on UDP port {port}, the game server port of the active event. The token ends up in the shell history, so the start script is the better choice.
                    </p>
                    <div role="tablist" aria-label="Shell">
                        {SHELLS.map((s) => (
                            <button key={s.shell} type="button" role="tab" aria-selected={shell === s.shell} onClick={() => setShell(s.shell)}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                    <div role="tabpanel" aria-label={SHELLS.find((s) => s.shell === shell)!.label}>
                        <p>
                            <label>
                                Start command <input type="text" readOnly value={run} size={100} autoComplete="off" spellCheck={false} />
                            </label>{' '}
                            <CopyButton text={run} label="Copy command" noun="command" />
                        </p>
                    </div>
                </section>
            )}
            <h3>Run the game server</h3>
            <ul>
                {SERVER_HELP.map((help) =>
                    help.label === 'Update' ? (
                        <li key={help.label}>
                            Update: the easy way is the start script with <code>update</code>, which gets the newest server and starts it with the saved token.
                            <ul>
                                {START_SCRIPTS.map((script) => (
                                    <li key={script.system}>
                                        {script.system}: <code>{script.update}</code>
                                    </li>
                                ))}
                            </ul>
                            Without the script, run{' '}
                            {help.commands.map((command, i) => (
                                <span key={command}>
                                    {i > 0 && ', then '}
                                    <code>{command}</code>
                                </span>
                            ))}
                            , then make a new token here and run the start command it shows.
                        </li>
                    ) : (
                        <li key={help.label}>
                            {help.label}: <code>{help.commands.join(' ')}</code>
                        </li>
                    ),
                )}
            </ul>
        </>
    );
}
