import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// These sign-ups come from their own made-up network, so they do not use up the limit the other tests share.
const network = { 'x-e2e-client': '192.0.2.10' };

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

/** Marks the window, so a full page load would lose the mark. */
const mark = (page: Page) => page.evaluate(() => Object.assign(window, { liveMark: true }));
const stillMarked = (page: Page) => page.evaluate(() => (window as unknown as { liveMark?: boolean }).liveMark === true);

test('open pages show new players, a new match, a bet and a new balance without a reload', async ({ browser }) => {
    const tag = randomBytes(2).toString('hex');
    const watcher = await signUp(browser, `Lw${tag}`);
    // The Elo board lists every player of the event, so new players show on it.
    const board = await watcher.context.newPage();
    await board.goto('/leaderboard?board=elo');
    await mark(board);
    const asker = await signUp(browser, `La${tag}`);
    const asked = await signUp(browser, `Lb${tag}`);
    await expect(board.getByRole('region', { name: 'Toppliste Elo' })).toContainText(`Lb${tag}`, { timeout: 15_000 });

    // The watcher keeps the front page open in one tab, and bets from /me in another.
    const front = watcher.page;
    await front.goto('/');
    const wallet = front.getByRole('navigation', { name: 'Hovudmeny' }).getByRole('link', { name: new RegExp(`^Lw${tag} · `) });
    const before = (await wallet.textContent()) ?? '';
    await mark(front);

    // Two other players start a 1v1 match. It is called at once, and shows on the open front page.
    const form = asker.page.getByRole('region', { name: 'Utfordra nogen te 1v1' });
    await form.getByLabel('Motstandar').selectOption({ label: `Lb${tag}` });
    await form.getByRole('button', { name: 'Send utfordring' }).click();
    await asked.page.goto('/me');
    await asked.page.getByRole('list', { name: 'Utfordringa te deg' }).getByRole('listitem').filter({ hasText: `La${tag} utfordre deg!` }).getByRole('button', { name: 'Godta' }).click();
    const card = front.getByRole('region', { name: 'I ringen no' }).getByRole('article').filter({ hasText: `La${tag} vs Lb${tag}` });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(front.getByText('Nytt på sidå')).toBeVisible();

    // The watcher bets in the other tab. The pot and the balance in the header follow on the front page.
    const me = await watcher.context.newPage();
    await me.goto('/me');
    const bet = me.locator('article').filter({ hasText: `La${tag} vs Lb${tag}` });
    await bet.getByRole('radio', { name: new RegExp(`^La${tag} `) }).check();
    await bet.getByLabel('Kor mykje Foza tør du?').fill('25');
    await bet.getByRole('button', { name: 'Sats' }).click();
    await expect(me.getByRole('status')).toHaveText('Spelet ditt e lagt inn. Lykke te!');
    await expect(card).toContainText('Potten e på 25 Foza', { timeout: 15_000 });
    await expect(wallet).not.toHaveText(before);

    expect(await stillMarked(front)).toBe(true);
    expect(await stillMarked(board)).toBe(true);

    await watcher.context.close();
    await asker.context.close();
    await asked.context.close();
});
