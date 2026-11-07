import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminPost = vi.fn();
const requireAdminRead = vi.fn();
const getPool = vi.fn(() => {
    throw new Error('the database must not be used before the admin check');
});

vi.mock('@/lib/auth/options', () => ({
    requireAdminPost: (...args: unknown[]) => requireAdminPost(...args),
    requireAdminRead: (...args: unknown[]) => requireAdminRead(...args),
}));
vi.mock('@/lib/db', () => ({ getPool: () => getPool() }));

const root = fileURLToPath(new URL('.', import.meta.url));

function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return routeFiles(path);
        return entry.name === 'route.ts' ? [path] : [];
    });
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const routes = routeFiles(root).map((file) => relative(root, file).replaceAll('\\', '/'));

beforeEach(() => {
    requireAdminPost.mockReset();
    requireAdminRead.mockReset();
    getPool.mockClear();
});

describe('every /api/admin route', () => {
    it('is found', () => {
        expect(routes).toEqual(expect.arrayContaining(['matches/call/route.ts', 'matches/[id]/route.ts', 'events/[id]/sponsors/route.ts', 'events/[id]/game-board/route.ts', 'events/[id]/big-screen-key/route.ts', 'game-server-token/route.ts', 'tournaments/[id]/next-game-delay/route.ts', 'sponsors/[id]/route.ts', 'sponsors/[id]/logo/route.ts']));
    });

    it.each(routes)('%s answers with the response from the admin check before it does anything else, the read check for GET and the post check otherwise', async (route) => {
        const mod = (await import(/* @vite-ignore */ `./${route}`)) as Record<string, unknown>;
        const handlers = METHODS.filter((method) => typeof mod[method] === 'function');
        expect(handlers.length).toBeGreaterThan(0);
        for (const method of handlers) {
            const [check, other] = method === 'GET' ? [requireAdminRead, requireAdminPost] : [requireAdminPost, requireAdminRead];
            for (const status of [401, 403]) {
                const denied = Response.json({ error: 'x' }, { status });
                check.mockResolvedValueOnce(denied);
                const req = new Request('https://bvt.example.test/api/admin/x', { method, body: method === 'GET' ? undefined : new URLSearchParams({ pin: '1234' }) });
                const handler = mod[method] as (req: Request, ctx: unknown) => Promise<Response>;
                const res = await handler(req, { params: Promise.resolve({ id: '1' }) });
                expect(res).toBe(denied);
                expect(check).toHaveBeenCalledWith(req);
                expect(other).not.toHaveBeenCalled();
            }
        }
        expect(getPool).not.toHaveBeenCalled();
    });
});
