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

    it('gives up on a connection instead of waiting forever', async () => {
        vi.stubEnv('DATABASE_URL', 'postgres://user:password@localhost:5432/example');
        const { getPool, CONNECT_TIMEOUT_MS, IDLE_TIMEOUT_MS } = await import('./db');
        const pool = getPool();
        expect(pool.options.connectionTimeoutMillis).toBe(CONNECT_TIMEOUT_MS);
        expect(pool.options.idleTimeoutMillis).toBe(IDLE_TIMEOUT_MS);
        expect(CONNECT_TIMEOUT_MS).toBeGreaterThan(0);
        await pool.end();
    });

    it('keeps running when an idle connection drops', async () => {
        vi.stubEnv('DATABASE_URL', 'postgres://user:password@localhost:5432/example');
        const { getPool } = await import('./db');
        const pool = getPool();
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => pool.emit('error', new Error('terminated'))).not.toThrow();
        expect(log).toHaveBeenCalledWith('Database connection lost:', 'terminated');
        log.mockRestore();
        await pool.end();
    });
});
