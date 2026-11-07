import { expect, test } from '@playwright/test';

test('admin page redirects to sign-in without a session', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin$/);
    await expect(page.getByRole('button', { name: 'Admin? Logg inn med GitHub' })).toBeVisible();
});

for (const path of ['/admin/events', '/admin/events/new', '/admin/events/1', '/admin/tournaments', '/admin/tournaments/new', '/admin/tournaments/1', '/admin/matches', '/admin/matches/1']) {
    test(`${path} redirects to sign-in without a session`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\?/);
        expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(path);
        await expect(page.getByRole('button', { name: 'Admin? Logg inn med GitHub' })).toBeVisible();
    });
}

for (const path of ['/api/admin/events', '/api/admin/events/1', '/api/admin/events/1/activate', '/api/admin/events/deactivate', '/api/admin/players/1/pin', '/api/admin/players/1/join-code', '/api/admin/tournaments', '/api/admin/matches/call', '/api/admin/matches/1']) {
    test(`POST ${path} answers 401 without a session`, async ({ request }) => {
        const res = await request.post(path, { form: { name: 'x' } });
        expect(res.status()).toBe(401);
    });
}

for (const [path, heading] of [
    ['/admin/tournaments', 'Tournaments'],
    ['/admin/tournaments/new', 'New tournament'],
    ['/admin/matches', 'Matches'],
]) {
    test(`${path} needs a login? and opens for an admin`, async ({ page, context, baseURL }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\?/);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toHaveCount(0);

        await context.addCookies([
            { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
        ]);
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Admin' })).toContainText('Signed in as');
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
