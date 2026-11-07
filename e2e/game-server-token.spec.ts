import { expect, test } from '@playwright/test';

// This file runs after every other test, since a new token stops the one they use.

test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

test('an admin makes a new game server token, sees it once with the start command, and the old token stops working', async ({ page, browser }) => {
    const old = process.env.E2E_GAME_SERVER_TOKEN ?? '';
    // The game server API is used with the token from the setup, so the page shows a last use.
    const caller = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    expect((await caller.request.get('/api/server/sync', { headers: bearer(old) })).status()).toBe(200);

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Game server' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Game server' })).toBeVisible();
    const start = page.getByRole('region', { name: 'Start the game server' });
    await expect(start).toContainText('e2e-server.lan:1234');
    // The numbered guide is gone. Setup, stop and update, and the start script are folded away.
    await expect(page.locator('main ol')).toHaveCount(0);
    for (const name of ['First time on this PC', 'Stop, logs and update', 'Other ways']) await expect(start.locator('summary', { hasText: name })).toBeVisible();
    await expect(start.getByText('-Protocol UDP -LocalPort 1234 -Action Allow')).toBeHidden();
    await start.locator('summary', { hasText: 'First time on this PC' }).click();
    await expect(start.getByText('-Protocol UDP -LocalPort 1234 -Action Allow')).toBeVisible();
    await start.locator('summary', { hasText: 'Other ways' }).click();
    await expect(start.getByRole('link', { name: 'Start script for Windows' })).toHaveAttribute('href', /tournament-server\.ps1$/);
    await expect(start.getByText('bash tournament-server.sh set-token')).toBeVisible();
    // The site has no BLOBBY_SERVER_TAG, so the scripts run their own default image.
    await expect(start.getByText('BLOBBY_SCRIPT_IMAGE')).toHaveCount(0);
    await expect(page.getByText('Token made')).toBeVisible();
    await expect(page.locator('.admin-health')).toHaveAttribute('data-ok', 'true');
    // Only the hash is stored, so no token shows before a new one is made.
    await expect(page.getByLabel('Game server token')).toHaveCount(0);

    // The box must be checked first.
    await page.getByRole('button', { name: 'Make a new token' }).click();
    await expect(page.getByLabel('Game server token')).toHaveCount(0);
    await page.getByLabel('The old token stops working at once').check();
    await page.getByRole('button', { name: 'Make a new token' }).click();
    await expect(page.getByRole('status')).toHaveText(/only time the token shows/);
    const token = await page.getByLabel('Game server token').inputValue();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toBe(old);
    expect(page.url()).not.toContain(token);

    const command = page.getByLabel('Start command');
    await expect(command).toHaveValue(
        `docker run -d --name blobby-server --restart unless-stopped -p 1234:1234/udp -v blobby-data:/data -e BLOBBY_TOURNAMENT=1 -e BLOBBY_SITE_URL=https://localhost -e BLOBBY_SITE_TOKEN=${token} sondresjo/blobby-server:latest`,
    );
    // One command, with no second copy of it for another shell.
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByText('docker run')).toHaveCount(0);
    await expect(page.getByText('Run it on the PC at the LAN that will host the game server')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy command' })).toBeVisible();
    await start.locator('summary', { hasText: 'Stop, logs and update' }).click();
    await expect(start.getByText('docker logs -f blobby-server')).toBeVisible();
    await expect(start.getByText('docker pull sondresjo/blobby-server:latest')).toBeVisible();

    const refused = await caller.request.get('/api/server/sync', { headers: bearer(old) });
    expect(refused.status()).toBe(401);
    expect(await refused.json()).toEqual({ error: 'unauthorized' });
    expect((await caller.request.get('/api/server/sync', { headers: bearer(token) })).status()).toBe(200);
    await caller.close();

    // After a reload the token is gone from the page, and the new token shows a last use.
    await page.reload();
    await expect(page.getByLabel('Game server token')).toHaveCount(0);
    expect(await page.content()).not.toContain(token);
    await expect(page.locator('.admin-health')).toHaveAttribute('data-ok', 'true');
});
