import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminApi = vi.fn();
const getPool = vi.fn(() => {
    throw new Error('the database must not be used before the admin check');
});

vi.mock('@/lib/auth/options', () => ({ requireAdminApi: (...args: unknown[]) => requireAdminApi(...args) }));
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
    requireAdminApi.mockReset();
    getPool.mockClear();
});

describe('every /api/admin route', () => {
    it('is found', () => {
        expect(routes).toEqual(expect.arrayContaining(['matches/call/route.ts', 'matches/[id]/route.ts', 'events/[id]/sponsors/route.ts', 'events/[id]/game-board/route.ts', 'events/[id]/big-screen-key/route.ts', 'game-server-token/route.ts', 'sponsors/[id]/route.ts', 'sponsors/[id]/logo/route.ts']));
    });

    it.each(routes)('%s answers with the response from requireAdminApi before it does anything else', async (route) => {
        const mod = (await import(/* @vite-ignore */ `./${route}`)) as Record<string, unknown>;
        const handlers = METHODS.filter((method) => typeof mod[method] === 'function');
        expect(handlers.length).toBeGreaterThan(0);
        for (const method of handlers) {
            for (const status of [401, 403]) {
                const denied = Response.json({ error: 'x' }, { status });
                requireAdminApi.mockResolvedValueOnce(denied);
                const req = new Request('https://bvt.example.test/api/admin/x', { method, body: method === 'GET' ? undefined : new URLSearchParams({ pin: '1234' }) });
                const handler = mod[method] as (req: Request, ctx: unknown) => Promise<Response>;
                const res = await handler(req, { params: Promise.resolve({ id: '1' }) });
                expect(res).toBe(denied);
                expect(requireAdminApi).toHaveBeenCalledWith(req);
            }
        }
        expect(getPool).not.toHaveBeenCalled();
    });
});
