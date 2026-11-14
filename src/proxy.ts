import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
import { authMisconfigured, isAuthPath, isProtectedPath, logMisconfigured, signInUrl } from '@/lib/auth/gate';
import { isAllowedUser } from '@/lib/auth/options';
import { contentSecurityPolicy, newNonce } from '@/lib/csp';

async function readToken(req: NextRequest) {
    try {
        return await getToken({ req });
    } catch {
        return null;
    }
}

/**
 * Gives every response a Content-Security-Policy with a new nonce. Next reads the nonce from the
 * policy on the request and puts it on the scripts of the page.
 */
export async function proxy(req: NextRequest) {
    const nonce = newNonce();
    const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production');
    const headers = new Headers(req.headers);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', policy);
    const res = await gate(req, () => NextResponse.next({ request: { headers } }));
    res.headers.set('Content-Security-Policy', policy);
    return res;
}

async function gate(req: NextRequest, next: () => NextResponse): Promise<NextResponse> {
    const { pathname } = req.nextUrl;
    if (pathname === '/health') return next();

    const protectedPath = isProtectedPath(pathname);

    // The sign-in routes and the admin pages stay closed when a session cookie would not be secure.
    if ((protectedPath || isAuthPath(pathname)) && authMisconfigured(process.env)) {
        logMisconfigured();
        return new NextResponse('Service unavailable', { status: 503 });
    }

    // Every other page is public. Player pages check the player session themselves.
    if (!protectedPath) return next();

    const token = await readToken(req);
    const isApi = pathname.toLowerCase().startsWith('/api/');

    if (!token) {
        if (isApi) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        return NextResponse.redirect(new URL(signInUrl(req.nextUrl), req.nextUrl.origin));
    }

    if (!isAllowedUser(token.githubId, process.env.ALLOWED_GITHUB_USER_IDS)) {
        if (isApi) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
        return NextResponse.redirect(new URL('/denied', req.nextUrl.origin));
    }

    return next();
}

// Every path goes through the check, except the built static files. The protected paths are
// decided in isProtectedPath, so a gap here cannot open a page.
export const config = {
    matcher: ['/((?!_next/static/).*)'],
};
