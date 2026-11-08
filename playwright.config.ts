import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Run with `npm run test:e2e`, which starts Postgres and the built site and sets E2E_BASE_URL.
export default defineConfig({
    testDir: 'e2e',
    outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || join(tmpdir(), 'blobby-volley-tournament-playwright'),
    reporter: 'list',
    fullyParallel: true,
    use: {
        baseURL: process.env.E2E_BASE_URL,
    },
    projects: [
        { name: 'site', testIgnore: /(game-server-token|event-host)\.spec\.ts$/ },
        // A new game server host changes the join links that the site tests check. So it runs after them.
        { name: 'event host', testMatch: /event-host\.spec\.ts$/, dependencies: ['site'] },
        // A new game server token stops the old one, which the site tests use. So it runs after them.
        // It does not wait for the event host tests, which keep the port and use no token.
        { name: 'game server token', testMatch: /game-server-token\.spec\.ts$/, dependencies: ['site'] },
    ],
});
