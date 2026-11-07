'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { serverRunCommand, SERVER_REMOVE } from '@/lib/game-server/commands';
import { CopyButton } from '../CopyButton';

const RELEASES = 'https://github.com/sondresjolyst/blobbyvolley2/releases/latest';
import { ManageServer, OtherWays } from './SetupGuide';

/**
 * Makes the game server token and shows it once, inside the one command that starts the game server.
 * The token comes back in the answer to a post, so it is never in an address. It is gone after a reload.
 * The children sit between the command and the other ways to start the game server.
 */
export function GameServerToken({
    hasToken,
    siteUrl,
    port,
    image,
    children,
}: {
    hasToken: boolean;
    siteUrl: string | null;
    port: number;
    image: string;
    children?: ReactNode;
}) {
    const router = useRouter();
    const [token, setToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

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

    // The token is base64url and the address an origin, so the line is the same in PowerShell and bash.
    const run = token ? serverRunCommand({ siteUrl: siteUrl ?? '<site address>', token, port, image }, 'powershell') : null;

    return (
        <div className="admin-guide">
            <form onSubmit={submit}>
                {hasToken && (
                    <label>
                        <input type="checkbox" name="confirm" value="yes" required /> The old token stops working at once
                    </label>
                )}{' '}
                <button type="submit" disabled={busy}>
                    {hasToken ? 'Make a new token' : 'Make a token'}
                </button>
            </form>
            {error && <p role="alert">{error}</p>}
            {run && (
                <section aria-labelledby="start-command">
                    <h3 id="start-command">Run this command</h3>
                    <p role="status">This is the only time the token shows. Copy the command now. Make a new token if it is lost.</p>
                    <p className="admin-command">
                        <label>
                            Start command <textarea readOnly value={run} rows={4} autoComplete="off" spellCheck={false} />
                        </label>{' '}
                        <CopyButton text={run} label="Copy command" noun="command" />
                    </p>
                    <p>
                        Run it on the PC at the LAN that will host the game server, in PowerShell or a Linux terminal. Docker must run there, see First time on this PC below. If this PC
                        ran the game server before, remove the old one first with <code>{SERVER_REMOVE}</code>.
                    </p>
                    <p>
                        The first start downloads the server, which can take a minute. Then watch the health line at the top turn green. Players can then join with the join link. They
                        need the game, the Windows download is in the <a href={RELEASES}>latest release</a>.
                    </p>
                </section>
            )}
            {children}
            <ManageServer image={image} />
            <OtherWays token={token} siteUrl={siteUrl} port={port} image={image} />
        </div>
    );
}
