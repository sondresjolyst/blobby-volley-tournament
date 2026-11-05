import { getServerSession, type NextAuthOptions, type Session } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { authMisconfigured, logMisconfigured } from './gate';

declare module 'next-auth' {
    interface Session {
        githubId?: string;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        githubId?: string;
    }
}

const DIGITS = /^[0-9]+$/;

/** Turns a GitHub ID from a token into a string of digits, or null when it is anything else. */
function idToString(value: unknown): string | null {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
    }
    if (typeof value === 'string' && DIGITS.test(value)) return value;
    return null;
}

/**
 * Checks the numeric GitHub user ID against the allowed IDs, a comma separated list. Entries that
 * are not a string of digits are ignored, so an unset or empty list denies everyone.
 */
export function isAllowedUser(githubId: unknown, allowed: string | undefined): boolean {
    if (typeof allowed !== 'string') return false;
    const id = idToString(githubId);
    if (id === null) return false;
    return allowed.split(',').some((entry) => {
        const trimmed = entry.trim();
        return DIGITS.test(trimmed) && trimmed === id;
    });
}

export const authOptions: NextAuthOptions = {
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_CLIENT_ID ?? '',
            clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
            authorization: { params: { scope: 'read:user' } },
            profile(profile: { id: number | string; login?: string }) {
                // The ID decides access. The login is only shown on the admin page.
                return { id: String(profile.id), name: profile.login ?? null };
            },
        }),
    ],
    session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
    pages: { signIn: '/signin', error: '/auth-error' },
    callbacks: {
        signIn({ user }) {
            return isAllowedUser(user.id, process.env.ALLOWED_GITHUB_USER_IDS) ? true : '/denied';
        },
        jwt({ token, user }) {
            if (user) token.githubId = user.id;
            return token;
        },
        session({ session, token }) {
            session.githubId = token.githubId;
            return session;
        },
    },
};

/**
 * Returns the session of an admin. It checks the stored ID against the allowed IDs on every call,
 * so a session stops working once `ALLOWED_GITHUB_USER_IDS` changes. Anyone else is redirected.
 */
export async function requireAdmin(): Promise<Session> {
    // The check depends on the request, so a page must never be built ahead of time.
    await connection();
    if (authMisconfigured(process.env)) {
        logMisconfigured();
        throw new Error('NEXTAUTH_URL must be an https URL in production');
    }
    const session = await getServerSession(authOptions);
    if (!session) redirect('/signin');
    if (!isAllowedUser(session.githubId, process.env.ALLOWED_GITHUB_USER_IDS)) redirect('/denied');
    return session;
}
