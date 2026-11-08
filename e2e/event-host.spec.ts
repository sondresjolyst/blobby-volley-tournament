import { randomBytes } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';

// This file changes the game server host of the active event, which the join links of the other
// tests use. So it runs after them, and it always puts the host back, also when a test fails.

async function signUp(browser: Browser, nickname: string) {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const page = await context.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    return { context, page };
}

test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

test.afterEach(async ({ page }) => {
    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    await expect(page).toHaveURL(/\/admin\/events\/\d+$/);
    await page.getByLabel('Game server host').fill('e2e-server.lan');
    await page.getByLabel('Game server port').fill('1234');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel('Game server host')).toHaveValue('e2e-server.lan');
});

test('an admin moves the game server to another PC and the join link follows at once', async ({ page, browser }) => {
    const tag = randomBytes(2).toString('hex');
    const asker = await signUp(browser, `Ha${tag}`);
    const asked = await signUp(browser, `Hb${tag}`);
    await asker.page.goto('/me');
    const form = asker.page.getByRole('region', { name: 'Utfordra någen te 1v1' });
    await form.getByLabel('Motstandar').selectOption({ label: `Hb${tag}` });
    await form.getByRole('button', { name: 'Send utfordring' }).click();
    await asked.page.goto('/me');
    await asked.page
        .getByRole('list', { name: 'Utfordringa te deg' })
        .getByRole('listitem')
        .filter({ hasText: `Ha${tag} utfordre deg!` })
        .getByRole('button', { name: 'Godta' })
        .click();
    // Both players are free, so the match is called as soon as it is accepted.
    await expect(asked.page.getByRole('heading', { name: 'Kampen din e klar!' })).toBeVisible();

    await asker.page.goto('/me');
    const hero = asker.page.getByRole('region', { name: 'Kampen din e klar!' });
    await expect(hero.getByRole('link', { name: 'opne lenkjå direkte' })).toHaveAttribute('href', /^blobby:\/\/join\?server=e2e-server\.lan:1234&code=/);

    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    await expect(page).toHaveURL(/\/admin\/events\/\d+$/);
    const info = page.getByRole('button', { name: 'Where to find the host' });
    await info.click();
    await expect(page.getByText('Not localhost or 127.0.0.1')).toBeVisible();
    // Escape closes the help also when focus is inside it.
    await page.getByText('Not localhost or 127.0.0.1').click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Not localhost or 127.0.0.1')).toBeHidden();
    await expect(info).toBeFocused();
    await page.getByLabel('Game server host').fill('192.168.1.77');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect(page.getByLabel('Game server host')).toHaveValue('192.168.1.77');

    // The next page load shows the new address, without a redeploy.
    await asker.page.goto('/me');
    await expect(hero.getByRole('link', { name: 'opne lenkjå direkte' })).toHaveAttribute('href', /^blobby:\/\/join\?server=192\.168\.1\.77:1234&code=/);
    await expect(hero.getByRole('definition').filter({ hasText: '192.168.1.77:1234' })).toBeVisible();
    await page.goto('/admin/game-server');
    const guide = page.getByRole('region', { name: 'Start the game server' });
    await expect(guide).toContainText('192.168.1.77:1234');
    await expect(guide).toContainText('If you change the port, start the game server container again with the new port.');

    await asker.context.close();
    await asked.context.close();
});
