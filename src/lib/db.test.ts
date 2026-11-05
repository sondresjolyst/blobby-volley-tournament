import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getPool', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('throws when DATABASE_URL is missing', async () => {
        vi.stubEnv('DATABASE_URL', '');
        const { getPool } = await import('./db');
        expect(() => getPool()).toThrow('DATABASE_URL is not set');
    });

    it('returns the same pool on every call', async () => {
        vi.stubEnv('DATABASE_URL', 'postgres://user:password@localhost:5432/example');
        const { getPool } = await import('./db');
        const pool = getPool();
        expect(getPool()).toBe(pool);
        await pool.end();
    });
});
