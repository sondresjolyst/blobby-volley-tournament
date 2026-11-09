import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { BACKGROUND_POST_HEADER } from './background-post';

/**
 * Sends the browser to a path on this site after a form post. The address is relative, so it
 * stays right behind a proxy that changes the host. A post that the page sent in the background
 * gets the path as JSON, so the page can load it without moving to the top.
 */
export async function seeOther(path: string): Promise<NextResponse> {
    if (await isBackgroundPost()) return NextResponse.json({ location: path }, { headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(null, { status: 303, headers: { Location: path } });
}

async function isBackgroundPost(): Promise<boolean> {
    try {
        return (await headers()).get(BACKGROUND_POST_HEADER) === '1';
    } catch {
        // Outside a request, as in a unit test, there are no headers.
        return false;
    }
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

/**
 * Reads the body bytes, and stops as soon as there are more than max. A body sent without a
 * content-length is counted as it arrives, so it is never held in full. Returns undefined when
 * the body is too large or breaks off.
 */
export async function readCappedBody(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | undefined> {
    if (!req.body) return new Uint8Array();
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > max) {
                await reader.cancel().catch(() => undefined);
                return undefined;
            }
            chunks.push(value);
        }
    } catch {
        return undefined;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export interface UploadForm {
    fields: Record<string, string>;
    /** The bytes of each file field. An empty file field counts as no file. */
    files: Record<string, Uint8Array>;
}

/**
 * Reads a multipart form post of at most max bytes in all. Returns 'too-large' when the body is
 * larger, and empty fields and files when it is not a form. Repeated fields keep the first value.
 */
export async function readUploadForm(req: Request, max: number): Promise<UploadForm | 'too-large'> {
    const result: UploadForm = { fields: {}, files: {} };
    const length = Number(req.headers.get('content-length') ?? '0');
    if (!(length <= max)) return 'too-large';
    const bytes = await readCappedBody(req, max);
    if (!bytes) return 'too-large';
    let form: FormData;
    try {
        form = await new Response(bytes, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
    } catch {
        return result;
    }
    for (const [key, value] of form) {
        if (key in result.fields || key in result.files) continue;
        if (typeof value === 'string') result.fields[key] = value;
        else if (value.size > 0) result.files[key] = new Uint8Array(await value.arrayBuffer());
    }
    return result;
}
