import type { Pool } from 'pg';

export const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

/** Rows older than this are deleted when a new window starts. Expired player sessions are deleted then too. */
const KEEP_MS = 24 * 60 * 60 * 1000;

/** The start of the fixed window that holds this moment. */
export function windowStart(now: Date, windowMs = ATTEMPT_WINDOW_MS): Date {
    return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** Adds one to the bucket in the current window and returns the new count. The update is atomic. */
export async function bumpAttempts(pool: Pool, bucket: string, now: Date): Promise<number> {
    const start = windowStart(now);
    const { rows } = await pool.query<{ count: number }>(
        `INSERT INTO auth_attempts (bucket, window_start, count) VALUES ($1, $2, 1)
         ON CONFLICT (bucket, window_start) DO UPDATE SET count = auth_attempts.count + 1
         RETURNING count`,
        [bucket, start],
    );
    const count = rows[0].count;
    if (count === 1) {
        await pool.query('DELETE FROM auth_attempts WHERE window_start < $1', [new Date(start.getTime() - KEEP_MS)]);
        await pool.query('DELETE FROM player_sessions WHERE expires_at <= $1', [now]);
    }
    return count;
}

/** Takes back one attempt, for example after a right PIN. */
export async function releaseAttempt(pool: Pool, bucket: string, now: Date): Promise<void> {
    await pool.query('UPDATE auth_attempts SET count = count - 1 WHERE bucket = $1 AND window_start = $2 AND count > 0', [bucket, windowStart(now)]);
}

export async function readAttempts(pool: Pool, bucket: string, now: Date): Promise<number> {
    const { rows } = await pool.query<{ count: number }>('SELECT count FROM auth_attempts WHERE bucket = $1 AND window_start = $2', [bucket, windowStart(now)]);
    return rows[0]?.count ?? 0;
}

/**
 * Claims one attempt in each bucket. When any bucket is over its limit, every claim is taken back
 * and the result is false. Each claim stays counted until it is released.
 */
export async function claimAttempts(pool: Pool, limits: { bucket: string; limit: number }[], now: Date): Promise<boolean> {
    const claimed: string[] = [];
    for (const { bucket, limit } of limits) {
        const count = await bumpAttempts(pool, bucket, now);
        claimed.push(bucket);
        if (count > limit) {
            for (const done of claimed) await releaseAttempt(pool, done, now);
            return false;
        }
    }
    return true;
}
