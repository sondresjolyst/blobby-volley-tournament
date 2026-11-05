const AUTH_PATHS = new Set(['/signin', '/denied', '/auth-error']);

/** Decodes a path until it stops changing. Returns null when it cannot be decoded. */
function decodePath(pathname: string): string | null {
    let current = pathname;
    for (let i = 0; i < 5; i++) {
        let next: string;
        try {
            next = decodeURIComponent(current);
        } catch {
            return null;
        }
        if (next === current) return current;
        current = next;
    }
    return null;
}

function isAdminPath(path: string): boolean {
    // Repeated slashes are collapsed first, so `//admin` matches like `/admin`.
    const lower = path.replace(/\/{2,}/g, '/').toLowerCase();
    return lower === '/admin' || lower.startsWith('/admin/') || lower === '/api/admin' || lower.startsWith('/api/admin/');
}

/**
 * Paths that need an admin login: `/admin`, `/api/admin` and everything below them. A path that
 * only starts with one of these names, such as `/administrator`, is not protected. A path that
 * cannot be read safely counts as protected, so a trick cannot open a page.
 */
export function isProtectedPath(pathname: string): boolean {
    const decoded = decodePath(pathname);
    if (decoded === null) return true;
    if (decoded.includes('..') || decoded.includes('\\')) return true;
    return isAdminPath(pathname) || isAdminPath(decoded);
}

/** The sign-in routes. They issue cookies, so they need the https check too. */
export function isAuthPath(pathname: string): boolean {
    if (AUTH_PATHS.has(pathname)) return true;
    return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

/** Returns the callback as a path on this site, or the start page when it is anything else. */
export function safeCallback(value: unknown): string {
    if (typeof value !== 'string') return '/';
    // A path that starts with two slashes or a backslash would read as another site.
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
    return value;
}

/** Builds the sign-in URL. The callback is a path on this site, never a full URL. */
export function signInUrl(url: URL): string {
    const target = new URL('/signin', url.origin);
    target.searchParams.set('callbackUrl', safeCallback(url.pathname + url.search));
    return target.pathname + target.search;
}

/**
 * True when production runs without an https `NEXTAUTH_URL`. Without it the session cookie would
 * not be marked secure, so the admin pages stay closed. Other environments may use http on localhost.
 */
export function authMisconfigured(env: Record<string, string | undefined>): boolean {
    if (env.NODE_ENV !== 'production') return false;
    // next-auth checks the prefix with startsWith, so the check here must be as literal.
    const url = env.NEXTAUTH_URL ?? '';
    if (!url.startsWith('https://')) return true;
    try {
        new URL(url);
        return false;
    } catch {
        return true;
    }
}

let logged = false;

/** Logs once that the sign-in setup is unsafe. */
export function logMisconfigured(): void {
    if (logged) return;
    logged = true;
    console.error('NEXTAUTH_URL must be an https URL in production. The admin pages and sign-in stay closed.');
}
