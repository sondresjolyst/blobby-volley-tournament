import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

// Set SITE_SHOTS to a folder to save screenshots of /join, /me and /leaderboard with a help box open.
const shots = process.env.SITE_SHOTS;
const SIZES = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } } as const;

// These sign-ups come from their own made-up network, so they do not use up the limit the other tests share.
const network = { 'x-e2e-client': '192.0.2.20' };

async function signUp(browser: Browser, nickname: string) {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, extraHTTPHeaders: network });
    const page = await context.newPage();
    await page.goto('/join');
    await page.getByLabel('LAN-kode').fill(process.env.E2E_EVENT_CODE ?? '');
    await page.getByLabel('Kallenavn').fill(nickname);
    await page.getByLabel('PIN-kode (4 siffer)').fill('1234');
    await page.getByRole('button', { name: 'Bli med på LANet' }).click();
    await expect(page).toHaveURL(/\/me$/);
    return { context, page };
}

/** Opens the help behind an i button in `root`, checks the text, and closes it with Escape. */
async function checkHelp(root: Page | Locator, name: string, text: string) {
    const page = 'page' in root ? root.page() : root;
    const button = root.getByRole('button', { name });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(root.getByText(text)).toBeHidden();
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(root.getByText(text)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(root.getByText(text)).toBeHidden();
    await expect(button).toBeFocused();
}

const scrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

async function shoot(page: Page, name: string) {
    for (const [size, viewport] of Object.entries(SIZES)) {
        await page.setViewportSize(viewport);
        expect(await scrollsSideways(page), `${name} at ${size} width`).toBe(false);
        if (shots) await page.screenshot({ path: join(shots, `${name}-${size}.png`), fullPage: true });
    }
}

test('the i buttons on /join and /login explain the fields without hiding the labels', async ({ page }) => {
    await page.goto('/join');
    await checkHelp(page, 'Koffor ein kode?', 'LAN-koden står på storskjermen og hos admin. Den sørge for at bare dei som e på LANet');
    await checkHelp(page, 'Ka slags kallenavn?', 'Velg eit kallenavn dei andre kjenne deg igjen på.');
    await checkHelp(page, 'Ka e PIN-koden te?', 'Fire siffer du finne på sjøl.');
    // The labels still name the fields alone, and each field points at its help.
    await expect(page.getByLabel('PIN-kode (4 siffer)')).toHaveAccessibleDescription(/Fire siffer du finne på sjøl./);
    await expect(page.getByLabel('LAN-kode')).toHaveAttribute('id', 'code');
    await expect(page.getByLabel('Kallenavn')).toHaveAttribute('id', 'nickname');
    await page.getByRole('button', { name: 'Ka e PIN-koden te?' }).click();
    await shoot(page, 'join');

    await page.goto('/login');
    await checkHelp(page, 'Ka kallenavn?', 'Kallenavnet du valgte då du blei med.');
    await checkHelp(page, 'Glømt PIN-koden?', 'Spør ein admin, så får du ein ny.');
});

test('the admin event form uses the same i button', async ({ page, context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    await page.goto('/admin/events/new');
    await checkHelp(page, 'Where to find the host', 'ipconfig on Windows');
    await expect(page.getByLabel('Game server host')).toHaveAccessibleDescription(/ipconfig on Windows/);
    const box = await page.getByRole('button', { name: 'Where to find the host' }).boundingBox();
    expect(box!.width).toBe(32);
    // The circle is 32px, and the button still takes a tap 6px outside it, so the target is 44px.
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('aria-label'), [box!.x - 6, box!.y + box!.height / 2]);
    expect(hit).toBe('Where to find the host');
    await page.getByRole('button', { name: 'Where to find the host' }).click();
    await shoot(page, 'admin-event-form');
});

test('the 1v1 form and the bet form on /me have help, and the leaderboard has the menu', async ({ browser }) => {
    const tag = randomBytes(2).toString('hex');
    const asker = await signUp(browser, `Ia${tag}`);
    const asked = await signUp(browser, `Ib${tag}`);

    // The front page header holds the wallet and Logg ut for a signed in player.
    await asker.page.goto('/');
    await expect(asker.page.getByRole('navigation', { name: 'Hovudmeny' }).getByRole('button', { name: 'Logg ut' })).toBeVisible();
    await shoot(asker.page, 'home');
    await asker.page.goto('/me');

    // The player menu reaches the leaderboard, which has the site menu with the wallet and sign-out.
    await asker.page.getByRole('navigation', { name: 'Spelarsidå' }).getByRole('link', { name: 'Toppliste' }).click();
    await expect(asker.page).toHaveURL(/\/leaderboard$/);
    const menu = asker.page.getByRole('navigation', { name: 'Hovudmeny' });
    await expect(menu).toContainText(`Ia${tag}`);
    await expect(menu.getByRole('button', { name: 'Logg ut' })).toBeVisible();
    await shoot(asker.page, 'leaderboard');
    await asker.page.goto('/leaderboard?board=elo');
    await asker.page.getByRole('region', { name: 'Toppliste Elo' }).getByRole('link', { name: `Ia${tag}` }).click();
    await expect(asker.page).toHaveURL(/\/leaderboard\/players\/\d+$/);
    await expect(asker.page.getByRole('heading', { level: 1, name: `Ia${tag}`, exact: true })).toBeVisible();
    await expect(asker.page.getByRole('navigation', { name: 'Hovudmeny' })).toBeVisible();

    await asker.page.goto('/me');
    const form = asker.page.getByRole('region', { name: 'Utfordra någen te 1v1' });
    await checkHelp(form, 'Kor mange sett?', 'Best av 3 betyr at den som vinne 2 sett, vinne kampen.');
    await checkHelp(form, 'Ka betyr dei?', 'Vanlig e vanlig Blobby Volley.');
    await checkHelp(form, 'Kor mange poeng?', 'Kor mange poeng som trengs for å vinna eit sett.');
    await checkHelp(form, 'Kor fort?', 'Kor fort Blobby Volley går, i bilde i sekundet.');
    await expect(form.getByLabel('Best av')).toHaveValue('1');
    await expect(form.getByLabel('Først te')).toHaveAccessibleDescription(/vanlig e 15 Kor mange poeng som trengs/);

    await form.getByLabel('Motstandar').selectOption({ label: `Ib${tag}` });
    await form.getByRole('button', { name: 'Send utfordring' }).click();
    // The form posts in the background, so the test waits for its answer before it moves on.
    await expect(asker.page.locator('form[aria-busy="true"]')).toHaveCount(0);
    await asked.page.goto('/me');
    await asked.page.getByRole('list', { name: 'Utfordringa te deg' }).getByRole('listitem').filter({ hasText: `Ia${tag} utfordre deg!` }).getByRole('button', { name: 'Godta' }).click();
    await expect(asked.page.locator('form[aria-busy="true"]')).toHaveCount(0);

    await asker.page.goto('/me');
    const form2 = asker.page.getByRole('region', { name: 'Utfordra någen te 1v1' });
    const card = asker.page.locator('article').filter({ hasText: `Ia${tag} vs Ib${tag}` });
    await checkHelp(card, 'Koss funke potten?', 'Vinne spelaren du satsa på, får du ein del av heile potten. Jo meir du satsa, jo større del.');
    await expect(card.getByLabel('Kor mykje Foza tør du?')).toBeVisible();
    await form2.getByRole('button', { name: 'Kor mange sett?' }).click();
    await shoot(asker.page, 'me');

    await asker.context.close();
    await asked.context.close();
});
