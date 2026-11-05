import { expect, test } from '@playwright/test';

test('admin page redirects to sign-in without a session', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fadmin$/);
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
});

for (const path of ['/admin/events', '/admin/events/new', '/admin/events/1', '/admin/tournaments', '/admin/tournaments/new', '/admin/tournaments/1']) {
    test(`${path} redirects to sign-in without a session`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/signin\?/);
        expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(path);
        await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    });
}

for (const path of ['/api/admin/events', '/api/admin/events/1', '/api/admin/events/1/activate', '/api/admin/events/deactivate', '/api/admin/players/1/pin', '/api/admin/tournaments']) {
    test(`POST ${path} answers 401 without a session`, async ({ request }) => {
        const res = await request.post(path, { form: { name: 'x' } });
        expect(res.status()).toBe(401);
    });
}

test('admin API answers 401 without a session', async ({ request }) => {
    const res = await request.get('/api/admin/anything');
    expect(res.status()).toBe(401);
});

test('start page stays public', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
});
