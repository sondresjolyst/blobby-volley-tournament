import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../scripts/migrate.mjs';
import { createGameServerToken, getGameServerTokenInfo, getStoredGameServerToken, hashGameServerToken, markGameServerTokenUsed } from './game-server-token';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

describe('the game server token', () => {
    it('does not exist until an admin makes one', async () => {
        expect(await getGameServerTokenInfo(pool)).toBeNull();
        expect(await getStoredGameServerToken(pool)).toBeNull();
    });

    it('is 32 random bytes in URL-safe text, and only its hash is stored', async () => {
        const { token, createdAt } = await createGameServerToken(pool);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(Buffer.from(token, 'base64url')).toHaveLength(32);
        const { rows } = await pool.query('SELECT * FROM game_server_token');
        expect(rows).toHaveLength(1);
        expect(rows[0].token_hash).toEqual(hashGameServerToken(token));
        expect(JSON.stringify(rows)).not.toContain(token);
        expect(await getGameServerTokenInfo(pool)).toEqual({ createdAt, lastUsedAt: null });
    });

    it('is replaced by a new one, and the old hash is gone at once', async () => {
        const first = await createGameServerToken(pool);
        await markGameServerTokenUsed(pool, hashGameServerToken(first.token));
        const second = await createGameServerToken(pool);
        expect(second.token).not.toBe(first.token);
        const stored = (await getStoredGameServerToken(pool))!;
        expect(stored.hash).toEqual(hashGameServerToken(second.token));
        expect(stored.lastUsedAt).toBeNull();
        expect((await pool.query('SELECT count(*)::int AS n FROM game_server_token')).rows[0].n).toBe(1);
    });

    it('notes the last use at most once a minute, and never for a replaced token', async () => {
        const { token } = await createGameServerToken(pool);
        const hash = hashGameServerToken(token);
        await markGameServerTokenUsed(pool, hash);
        const first = (await getGameServerTokenInfo(pool))!.lastUsedAt!;
        expect(first).toBeInstanceOf(Date);
        await markGameServerTokenUsed(pool, hash);
        expect((await getGameServerTokenInfo(pool))!.lastUsedAt).toEqual(first);
        await pool.query("UPDATE game_server_token SET last_used_at = now() - interval '61 seconds'");
        const old = (await getGameServerTokenInfo(pool))!.lastUsedAt!;
        await markGameServerTokenUsed(pool, hash);
        expect((await getGameServerTokenInfo(pool))!.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(old.getTime() + 60_000);

        await createGameServerToken(pool);
        await markGameServerTokenUsed(pool, hash);
        expect((await getGameServerTokenInfo(pool))!.lastUsedAt).toBeNull();
    });

    it('is one row at most, with a 32 byte hash', async () => {
        await createGameServerToken(pool);
        await expect(pool.query("INSERT INTO game_server_token (id, token_hash) VALUES (false, '\\x00')")).rejects.toThrow(/check/);
        await expect(pool.query("UPDATE game_server_token SET token_hash = '\\x00'")).rejects.toThrow(/game_server_token_token_hash_check/);
    });
});
