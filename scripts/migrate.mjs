// Applies the numbered SQL files in migrations/ that have not run yet, in order.
// Run with `npm run db:migrate`. It reads DATABASE_URL.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

const FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

// Any number works, as long as only this runner uses it.
const LOCK_ID = 7_310_402;

/**
 * Lists the migration files in order of their number.
 * @param {string} dir
 * @returns {{ name: string, sql: string }[]}
 */
export function readMigrations(dir = MIGRATIONS_DIR) {
    const names = readdirSync(dir)
        .filter((name) => FILE_NAME.test(name))
        .sort();
    const numbers = names.map((name) => name.slice(0, 4));
    if (new Set(numbers).size !== numbers.length) throw new Error('Two migration files share a number.');
    return names.map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
}

/**
 * Applies every migration that is not in schema_migrations yet. Each file runs in its own
 * transaction. An advisory lock keeps two runners from applying the same file at once.
 * @param {import('pg').Pool} pool
 * @param {string} dir
 * @returns {Promise<string[]>} the names of the files that were applied
 */
export async function migrate(pool, dir = MIGRATIONS_DIR) {
    const migrations = readMigrations(dir);
    const client = await pool.connect();
    const applied = [];
    try {
        await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
        try {
            await client.query(
                `CREATE TABLE IF NOT EXISTS schema_migrations (
                    name text PRIMARY KEY,
                    applied_at timestamptz NOT NULL DEFAULT now()
                )`,
            );
            const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
            for (const migration of migrations) {
                if (done.has(migration.name)) continue;
                await client.query('BEGIN');
                try {
                    await client.query(migration.sql);
                    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
                    await client.query('COMMIT');
                } catch (error) {
                    await client.query('ROLLBACK');
                    throw error;
                }
                applied.push(migration.name);
            }
        } finally {
            await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
        }
    } finally {
        client.release();
    }
    return applied;
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not set.');
        process.exitCode = 1;
        return;
    }
    // A short timeout makes the init container fail fast when the database cannot be reached.
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
    try {
        const applied = await migrate(pool);
        console.log(applied.length ? `Applied ${applied.join(', ')}.` : 'The database is up to date.');
    } catch (error) {
        // Error text can hold a connection string, so only the name and code are shown.
        const { name, code } = /** @type {{ name?: unknown, code?: unknown }} */ (error);
        console.error(`Migration failed. name=${String(name)} code=${String(code)}`);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
