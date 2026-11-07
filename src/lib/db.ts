import { Pool } from 'pg';

let pool: Pool | undefined;

// A request waits at most this long for a connection instead of hanging when the database is unreachable.
export const CONNECT_TIMEOUT_MS = 5_000;
// Idle connections are kept for a minute, so a quiet minute does not cost a new TLS handshake on the next request.
export const IDLE_TIMEOUT_MS = 60_000;

export function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL is not set');
        }
        pool = new Pool({
            connectionString,
            max: 10,
            connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
            idleTimeoutMillis: IDLE_TIMEOUT_MS,
        });
        // An idle connection that drops emits an error on the pool. Without a listener it would end the process.
        pool.on('error', (err) => {
            console.error('Database connection lost:', err.message);
        });
    }
    return pool;
}
