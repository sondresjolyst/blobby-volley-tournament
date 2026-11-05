import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const port = 3100;

export default defineConfig({
    testDir: 'e2e',
    outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || join(tmpdir(), 'blobby-volley-tournament-playwright'),
    reporter: 'list',
    fullyParallel: true,
    use: {
        baseURL: process.env.E2E_BASE_URL || `http://localhost:${port}`,
    },
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: 'npm run build && node scripts/prepare-standalone.mjs && node .next/standalone/server.js',
              env: { PORT: String(port), HOSTNAME: 'localhost' },
              url: `http://localhost:${port}/health`,
              timeout: 180_000,
              reuseExistingServer: true,
          },
});
