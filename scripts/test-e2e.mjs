// Runs the Playwright checks against the production build with a seeded Postgres.
// Run `npm run build` first. Every value here is invented for the test.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encode } from 'next-auth/jwt';
import pg from 'pg';
import { migrate } from './migrate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const standalone = fileURLToPath(new URL('../.next/standalone/', import.meta.url));

const name = 'blobby-volley-tournament-e2e-db';
const dbPort = '54340';
const appPort = process.env.E2E_APP_PORT ?? '3100';
const databaseUrl = `postgres://postgres:test@127.0.0.1:${dbPort}/bvt_e2e`;
const baseUrl = `http://localhost:${appPort}`;
const secret = 'e2e-placeholder-secret';
const adminId = '1';
const gameServerToken = 'e2e-placeholder-game-server-token';

// The event the tests sign up to. The code is invented.
const E2E_EVENT_CODE = 'E2E-LAN-2026';

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const cleanupDb = () => docker('rm', '--force', '--volumes', name);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (script, args, env = {}) =>
    spawnSync(process.execPath, [fileURLToPath(new URL(`../node_modules/${script}`, import.meta.url)), ...args], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, ...env },
    }).status ?? 1;

async function waitFor(check, what) {
    for (let attempt = 0; attempt < 60; attempt++) {
        if (await check()) return;
        await sleep(500);
    }
    throw new Error(`${what} did not become ready in time.`);
}

async function seed() {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
        await migrate(pool);
        await pool.query(
            `INSERT INTO events (name, starts_on, ends_on, code, starting_foza, daily_foza, is_active, server_host, server_port)
             VALUES ('E2E LAN', '2026-11-20', '2026-11-22', $1, 1000, 100, true, 'e2e-server.lan', 1234)`,
            [E2E_EVENT_CODE],
        );
    } finally {
        await pool.end();
    }
}

let server = null;
let code = 1;
try {
    cleanupDb();
    const started = docker(
        'run', '--detach', '--name', name,
        '--publish', `127.0.0.1:${dbPort}:5432`,
        '--env', 'POSTGRES_PASSWORD=test',
        '--env', 'POSTGRES_DB=bvt_e2e',
        'postgres:17-alpine',
    );
    if (started.status !== 0) throw new Error('Could not start the Postgres container.');
    await waitFor(() => {
        const probe = docker('exec', name, 'psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'bvt_e2e', '-tAc', 'select 1');
        return probe.status === 0 && probe.stdout.trim() === '1';
    }, 'Postgres');

    await seed();

    if (spawnSync(process.execPath, ['scripts/prepare-standalone.mjs'], { cwd: root, stdio: 'inherit' }).status !== 0) {
        throw new Error('Could not copy the static files. Run npm run build first.');
    }
    server = spawn(process.execPath, ['server.js'], {
        cwd: standalone,
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: appPort,
            HOSTNAME: 'localhost',
            DATABASE_URL: databaseUrl,
            // Placeholder auth values. The server runs in production mode, which needs an https address.
            NEXTAUTH_URL: 'https://localhost',
            NEXTAUTH_SECRET: secret,
            GITHUB_CLIENT_ID: 'e2e-placeholder',
            GITHUB_CLIENT_SECRET: 'e2e-placeholder',
            ALLOWED_GITHUB_USER_IDS: adminId,
            GAME_SERVER_TOKEN: gameServerToken,
        },
    });
    await waitFor(async () => {
        try {
            return (await fetch(`${baseUrl}/health`)).ok;
        } catch {
            return false;
        }
    }, 'The app');

    // A session for the test admin, signed with the placeholder secret.
    const adminToken = await encode({ token: { githubId: adminId }, secret });
    code = run('@playwright/test/cli.js', ['test', ...process.argv.slice(2)], { E2E_BASE_URL: baseUrl, E2E_EVENT_CODE, E2E_ADMIN_TOKEN: adminToken, E2E_GAME_SERVER_TOKEN: gameServerToken });
} catch (error) {
    console.error(error instanceof Error ? error.message : 'The check failed.');
} finally {
    server?.kill();
    cleanupDb();
}
process.exit(code);
