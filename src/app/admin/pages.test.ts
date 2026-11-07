import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const getPool = vi.fn(() => {
    throw new Error('the database must not be used before the admin check');
});

vi.mock('@/lib/auth/options', () => ({ requireAdmin: () => requireAdmin() }));
vi.mock('@/lib/db', () => ({ getPool: () => getPool() }));

const root = fileURLToPath(new URL('.', import.meta.url));

function pageFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return pageFiles(path);
        return entry.name === 'page.tsx' ? [path] : [];
    });
}

const pages = pageFiles(root).map((file) => relative(root, file).replaceAll('\\', '/'));

beforeEach(() => {
    requireAdmin.mockReset();
    getPool.mockClear();
});

describe('every /admin page', () => {
    it('is found', () => {
        expect(pages).toEqual(expect.arrayContaining(['page.tsx', 'tournaments/page.tsx', 'tournaments/new/page.tsx', 'tournaments/[id]/page.tsx', 'matches/page.tsx', 'matches/[id]/page.tsx']));
    });

    it.each(pages)('%s calls requireAdmin before it does anything else', async (page) => {
        const mod = (await import(/* @vite-ignore */ `./${page}`)) as { default: (props: unknown) => Promise<unknown> };
        // requireAdmin redirects by throwing, so a page that calls it first stops there.
        requireAdmin.mockRejectedValueOnce(new Error('redirect:/login'));
        await expect(mod.default({ params: Promise.resolve({ id: '1' }), searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/login');
        expect(requireAdmin).toHaveBeenCalledTimes(1);
        expect(getPool).not.toHaveBeenCalled();
    });
});
