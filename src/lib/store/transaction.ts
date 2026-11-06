import type { Pool, PoolClient } from 'pg';

/** Runs the work in one transaction. It commits when the work returns and rolls back when it throws. */
export async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    let released = false;
    try {
        await client.query('BEGIN');
        try {
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                // The connection is broken. It is dropped from the pool and the first error is kept.
                released = true;
                client.release(rollbackError instanceof Error ? rollbackError : true);
            }
            throw error;
        }
    } finally {
        if (!released) client.release();
    }
}
