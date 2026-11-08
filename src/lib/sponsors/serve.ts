/**
 * Answers with a stored logo. The type is the one found when the logo was checked, and nosniff
 * keeps the browser from reading the bytes as anything else. The hash is the ETag, so a browser
 * that has the logo gets 304.
 */
export function logoResponse(req: Request, logo: { bytes: Uint8Array; type: string; hash: string }, cacheControl: string): Response {
    const etag = `"${logo.hash}"`;
    const headers = { 'Content-Type': logo.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': cacheControl, ETag: etag };
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(logo.bytes), { headers: { ...headers, 'Content-Length': String(logo.bytes.byteLength) } });
}

/** A year, for an address that holds the hash of the logo and so never shows another one. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';
