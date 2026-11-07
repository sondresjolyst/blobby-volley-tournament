// The game server token. Only its SHA-256 hash is stored. The token itself is only in the answer
// to the admin who makes it. This file imports nothing from the app, so the e2e script can use it.
import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * Calls closer than this to the last stored use do not write the time again. The admin page shows
 * the game server as healthy for a minute after the last use, so this is well under that.
 */
export const LAST_USED_STEP_MS = 15_000;

export interface GameServerTokenInfo {
    createdAt: Date;
    lastUsedAt: Date | null;
}

export interface StoredGameServerToken extends GameServerTokenInfo {
    hash: Buffer;
}

export function hashGameServerToken(token: string): Buffer {
    return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * Makes a new token from the cryptographic random source and stores its hash in place of the old
 * one, which stops working at once. 32 bytes, written as 43 URL-safe characters. The token is in
 * the answer and nowhere else, so show it to the admin and do not log it.
 */
export async function createGameServerToken(pool: Pool): Promise<{ token: string; createdAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const { rows } = await pool.query<{ created_at: Date }>(
        `INSERT INTO game_server_token (id, token_hash) VALUES (true, $1)
         ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = now(), last_used_at = NULL
         RETURNING created_at`,
        [hashGameServerToken(token)],
    );
    return { token, createdAt: rows[0].created_at };
}

/** When the token was made and last used, or null when there is none. Holds no secret. */
export async function getGameServerTokenInfo(pool: Pool): Promise<GameServerTokenInfo | null> {
    const stored = await getStoredGameServerToken(pool);
    return stored ? { createdAt: stored.createdAt, lastUsedAt: stored.lastUsedAt } : null;
}

/** The stored hash and times, for the check of a game server call. Null when there is no token. */
export async function getStoredGameServerToken(pool: Pool): Promise<StoredGameServerToken | null> {
    const { rows } = await pool.query<{ token_hash: Buffer; created_at: Date; last_used_at: Date | null }>('SELECT token_hash, created_at, last_used_at FROM game_server_token');
    const row = rows[0];
    return row ? { hash: row.token_hash, createdAt: row.created_at, lastUsedAt: row.last_used_at } : null;
}

/**
 * Notes that the token with this hash was used. It writes only when the last use is LAST_USED_STEP_MS
 * old or more, so a busy game server does not write on every call. A token replaced in the meantime is
 * left alone.
 */
export async function markGameServerTokenUsed(pool: Pool, hash: Buffer): Promise<void> {
    await pool.query(
        `UPDATE game_server_token SET last_used_at = now()
         WHERE token_hash = $1 AND (last_used_at IS NULL OR last_used_at <= now() - make_interval(secs => $2))`,
        [hash, LAST_USED_STEP_MS / 1000],
    );
}
