import { NextResponse } from 'next/server';

/**
 * Sends the browser to a path on this site after a form post. The address is relative, so it
 * stays right behind a proxy that changes the host.
 */
export function seeOther(path: string): NextResponse {
    return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * True when a form post comes from this site. Sec-Fetch-Site must be same-origin or none. A
 * browser that does not send it must send an Origin that matches NEXTAUTH_URL. A post with
 * neither header is refused.
 */
export function isTrustedPost(req: Request, env: Record<string, string | undefined>): boolean {
    const site = req.headers.get('sec-fetch-site');
    if (site !== null) return site === 'same-origin' || site === 'none';
    const origin = req.headers.get('origin');
    if (!origin || !env.NEXTAUTH_URL) return false;
    try {
        return new URL(env.NEXTAUTH_URL).origin === origin;
    } catch {
        return false;
    }
}

/** Reads a form post into plain strings. Files and repeated fields are ignored. */
export async function readForm(req: Request): Promise<Record<string, string>> {
    const values: Record<string, string> = {};
    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return values;
    }
    for (const [key, value] of form) {
        if (typeof value === 'string' && !(key in values)) values[key] = value;
    }
    return values;
}

/** A database ID from the address, or null. */
export function parseId(value: string): number | null {
    if (!/^[1-9][0-9]{0,9}$/.test(value)) return null;
    const id = Number(value);
    return id <= 2_147_483_647 ? id : null;
}
