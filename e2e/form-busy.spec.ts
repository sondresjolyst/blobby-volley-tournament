import { expect, test } from '@playwright/test';

// A form that is being sent shows it on its button, and text typed in other forms stays.

test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

test('a busy form disables its button and keeps text typed in other forms', async ({ page }) => {
    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'E2E LAN' })).toBeVisible();

    // The event is not saved, so the typed value only lives in the field.
    const dailyFoza = page.getByLabel('Daily Foza');
    const saved = await dailyFoza.inputValue();
    const typed = String(Number(saved) + 7);
    await dailyFoza.fill(typed);

    // The post waits a moment, so the busy button can be seen.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/admin/players/pin-limit', async (route) => {
        await held;
        await route.continue();
    });

    const form = page.locator('form[action="/api/admin/players/pin-limit"]');
    await form.getByRole('button', { name: 'Reset network PIN limit' }).click();
    await expect(form).toHaveAttribute('aria-busy', 'true');
    const busy = form.getByRole('button', { name: 'Saving…' });
    await expect(busy).toBeDisabled();
    release();

    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
    await expect(page.locator('form[action="/api/admin/players/pin-limit"]').getByRole('button', { name: 'Reset network PIN limit' })).toBeEnabled();
    await expect(dailyFoza).toHaveValue(typed);
});
