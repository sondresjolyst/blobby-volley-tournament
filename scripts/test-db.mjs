import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const name = 'blobby-volley-tournament-test-db';
const port = '54339';
const url = `postgres://postgres:test@127.0.0.1:${port}/bvt_test`;

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });

const cleanup = () => {
    docker('rm', '--force', '--volumes', name);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const finish = (child) =>
    new Promise((resolve) => {
        child.on('error', () => resolve(1));
        child.on('close', (status) => resolve(status ?? 1));
    });

let child = null;

const stop = (signal) => {
    child?.kill(signal);
    cleanup();
    process.exit(130);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

let code = 1;
try {
    cleanup();
    child = spawn(
        'docker',
        [
            'run', '--detach', '--name', name,
            '--publish', `127.0.0.1:${port}:5432`,
            '--env', 'POSTGRES_PASSWORD=test',
            '--env', 'POSTGRES_DB=bvt_test',
            'postgres:17-alpine',
        ],
        { stdio: 'inherit' },
    );
    const started = await finish(child);
    child = null;
    if (started !== 0) {
        console.error('Could not start the Postgres container.');
    } else {
        let ready = false;
        for (let attempt = 0; attempt < 60 && !ready; attempt++) {
            const probe = docker('exec', name, 'psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'bvt_test', '-tAc', 'select 1');
            ready = probe.status === 0 && probe.stdout.trim() === '1';
            if (!ready) await sleep(500);
        }
        if (!ready) {
            console.error('Postgres did not become ready in time.');
        } else {
            child = spawn(process.execPath, [vitest, 'run', '--config', 'vitest.db.config.mts'], {
                cwd: root,
                stdio: 'inherit',
                env: { ...process.env, TEST_DATABASE_URL: url },
            });
            code = await finish(child);
            child = null;
        }
    }
} finally {
    cleanup();
}
process.exit(code);
