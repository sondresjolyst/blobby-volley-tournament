// The Content-Security-Policy of every page. The proxy makes a new nonce for each request, and
// Next puts it on its own scripts while it renders the page, so script-src needs no 'unsafe-inline'.

/** A new random nonce for one request. */
export function newNonce(): string {
    return Buffer.from(crypto.randomUUID()).toString('base64');
}

/** The policy for one request with its nonce. Development also allows eval, which React uses there for its error stacks. */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "font-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        'upgrade-insecure-requests',
    ].join('; ');
}
