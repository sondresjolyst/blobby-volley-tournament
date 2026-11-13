import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The site reads the release from e2e/fixtures/game-release.json, served by scripts/test-e2e.mjs, never from GitHub.
// Set SITE_SHOTS to a folder to save screenshots of the page.
const shots = process.env.SITE_SHOTS;
const DOWNLOAD = 'https://github.com/sondresjolyst/blobbyvolley2-tournament/releases/download/v0.1.1/';

const AGENTS = {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    phone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const scrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test.describe('on Windows', () => {
    test.use({ userAgent: AGENTS.windows, viewport: { width: 1440, height: 900 } });

    test('the page offers the Windows file first and the other systems below', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('navigation', { name: 'Hovudmeny' }).getByRole('link', { name: 'Last ned' }).click();
        await expect(page).toHaveURL(/\/last-ned$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Last ned spelet' })).toBeVisible();
        await expect(page.getByText('Versjon 0.1.1 · 8. november 2026')).toBeVisible();

        const hero = page.locator('section', { has: page.getByRole('heading', { level: 1 }) });
        await expect(hero.getByRole('link', { name: 'Last ned for Windows' })).toHaveAttribute('href', `${DOWNLOAD}blobbyvolley2-tournament-0.1.1-windows-x64.zip`);
        await expect(hero.getByText('Blobby Volley 2 Tournament')).toBeVisible();

        const others = page.getByRole('region', { name: 'Andre system' });
        await expect(others.getByRole('link')).toHaveCount(3);
        await expect(others.getByRole('link', { name: 'Last ned for Mac med M1 eller nyare' })).toHaveAttribute('href', `${DOWNLOAD}blobbyvolley2-tournament-0.1.1-macos-arm64.zip`);
        await expect(others.getByRole('link', { name: 'Last ned for Linux' })).toHaveAttribute('href', `${DOWNLOAD}blobbyvolley2-tournament-0.1.1-linux-x64.tar.gz`);

        // The Windows steps come first. The server scripts stay in a small note, and other files are left out.
        await expect(page.getByRole('region', { name: 'Sånn får du det opp' }).getByRole('heading', { level: 3 }).first()).toHaveText('Windows');
        await expect(page.getByText('Run anyway')).toBeVisible();
        await expect(page.getByRole('region', { name: 'For serveren' }).getByRole('link')).toHaveText(['tournament-server.ps1', 'tournament-server.sh']);
        await expect(page.getByText('checksums.txt')).toHaveCount(0);

        expect(await scrollsSideways(page)).toBe(false);
        if (shots) await page.screenshot({ path: join(shots, 'download-1440.png'), fullPage: true });
    });
});

test.describe('on a Mac', () => {
    test.use({ userAgent: AGENTS.mac });

    test('the page offers both Mac files, since the browser does not tell the processor', async ({ page }) => {
        await page.goto('/last-ned');
        const hero = page.locator('section', { has: page.getByRole('heading', { level: 1 }) });
        await expect(hero.getByRole('link', { name: 'Last ned for Mac med M1 eller nyare' })).toBeVisible();
        await expect(hero.getByRole('link', { name: 'Last ned for Mac med Intel' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Andre system' }).getByRole('link')).toHaveCount(2);
        await expect(page.getByText('Spelet treng macOS 26 eller nyare.')).toBeVisible();
        await expect(page.getByText('Blobby Volley 2 Tournament.app')).toBeVisible();
    });
});

test.describe('on a phone', () => {
    test.use({ userAgent: AGENTS.phone, viewport: { width: 390, height: 844 } });

    test('the page lists every system and fits the screen', async ({ page }) => {
        await page.goto('/last-ned');
        await expect(page.getByRole('region', { name: 'Velg systemet ditt' }).getByRole('link')).toHaveCount(4);
        expect(await scrollsSideways(page)).toBe(false);
        if (shots) await page.screenshot({ path: join(shots, 'download-390.png'), fullPage: true });
    });
});

test('the join page points to the download page', async ({ page }) => {
    await page.goto('/join');
    await expect(page.getByRole('link', { name: 'Last det ned' })).toHaveAttribute('href', '/last-ned');
});
