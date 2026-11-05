import { expect, test } from '@playwright/test';

test('admin page redirects to sign-in without a session', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fadmin$/);
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
});

test('admin API answers 401 without a session', async ({ request }) => {
    const res = await request.get('/api/admin/anything');
    expect(res.status()).toBe(401);
});

test('start page stays public', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
});
