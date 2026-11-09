import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import pg from 'pg';

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

async function adminContext(browser: Browser, baseURL: string): Promise<BrowserContext> {
    const admin = await browser.newContext({ baseURL });
    await admin.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    return admin;
}

test('a player challenges another to a 1v1, the other sees it and accepts without a reload, and both get the join link', async ({ browser }) => {
    const tag = randomBytes(2).toString('hex');
    const asker = await signUp(browser, `Ua${tag}`);
    const asked = await signUp(browser, `Ub${tag}`);
    // The asker loads the page again, so the new player is in the list.
    await asker.page.goto('/me');
    // The E2E event pays 100 Foza a day, and the page says so quietly.
    await expect(asker.page.getByText('Du får 100 Foza kvar dag du e med.')).toBeVisible();
    // The day of the sign-up is covered by the starting Foza, so there is no notice of a daily payment.
    await expect(asker.page.getByText(/Du fekk .* Foza for i dag/)).toHaveCount(0);

    // Settings out of bounds are refused before anything is stored.
    const refused = await asker.page.request.post('/api/player/challenges', {
        form: { opponent: '1', speed: '500' },
        headers: { 'sec-fetch-site': 'same-origin' },
        maxRedirects: 0,
    });
    expect(refused.headers()['location']).toBe('/me?challengeError=form#utfordringa');

    const form = asker.page.getByRole('region', { name: 'Utfordra någen te 1v1' });
    await expect(form.getByLabel('Først te')).toHaveValue('15');
    await expect(form.getByLabel('Fart', { exact: true })).toHaveValue('75');
    await form.getByLabel('Motstandar').selectOption({ label: `Ub${tag}` });
    await form.getByLabel('Best av').selectOption('3');
    await form.getByLabel('Først te').fill('21');
    await form.getByLabel('Fart', { exact: true }).fill('90');
    await form.getByRole('button', { name: 'Send utfordring' }).click();
    await expect(asker.page.getByRole('status')).toHaveText('Utfordringå e sendt. Nå e det opp te motstandaren.');
    await expect(asker.page.getByRole('list', { name: 'Utfordringa frå deg' })).toContainText(`Du vente på svar frå Ub${tag}`);

    // The same pair cannot have two open 1v1 matches.
    await form.getByLabel('Motstandar').selectOption({ label: `Ub${tag}` });
    await form.getByRole('button', { name: 'Send utfordring' }).click();
    await expect(asker.page.getByRole('alert').filter({ hasText: 'Dåkke to har allerede ein 1v1 som ikkje e ferdig. Svar på utfordringå, eller spel ferdig den kampen først.' })).toBeVisible();

    // The asked player still has /me open from the sign-up, and the challenge shows up without a reload.
    const incoming = asked.page.getByRole('list', { name: 'Utfordringa te deg' }).getByRole('listitem').filter({ hasText: `Ua${tag} utfordre deg!` });
    await expect(incoming).toContainText('Best av 3 · først te 21 · 90 fps', { timeout: 15_000 });
    await expect(asker.page.getByRole('button', { name: 'Kopier lenkjå' })).toHaveCount(0);
    await incoming.getByRole('button', { name: 'Godta' }).click();
    // Both players are free, so the match is called at once without an admin.
    await expect(asked.page.getByRole('status')).toHaveText('Du godtok kampen. Dåkke kan spela med ein gang.');
    await expect(asked.page.getByRole('heading', { name: 'Kampen din e klar!' })).toBeVisible();
    // The asker sees the called match without a reload.
    await expect(asker.page.getByRole('heading', { name: 'Kampen din e klar!' })).toBeVisible({ timeout: 15_000 });
    await expect(asker.page.getByText(`Du vente på svar frå Ub${tag}`)).toHaveCount(0);

    const sync = await (await asker.page.request.get('/api/server/sync', { headers: { authorization: `Bearer ${process.env.E2E_GAME_SERVER_TOKEN ?? ''}` } })).json();
    const codeOf = (nickname: string) => sync.players.find((p: { nickname: string }) => p.nickname === nickname).code as string;
    for (const [player, own, other] of [
        [asker, `Ua${tag}`, `Ub${tag}`],
        [asked, `Ub${tag}`, `Ua${tag}`],
    ] as const) {
        const link = `blobby://join?server=e2e-server.lan:1234&code=${codeOf(own)}`;
        await player.context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await player.page.goto('/me');
        const hero = player.page.getByRole('region', { name: 'Kampen din e klar!' });
        await expect(hero.getByRole('heading', { name: 'Kampen din e klar!' })).toBeVisible();
        // The main button puts the exact link on the clipboard.
        await player.page.evaluate(() => navigator.clipboard.writeText(''));
        await expect(hero.getByText('Kopiert!')).toHaveCount(0);
        await hero.getByRole('button', { name: 'Kopier lenkjå' }).click();
        await expect(hero.getByText('Kopiert!')).toBeVisible();
        expect(await player.page.evaluate(() => navigator.clipboard.readText())).toBe(link);
        // The link still opens the game where the link type is registered.
        // The direct link sits behind the help button.
        await hero.getByRole('button', { name: 'Kan eg opna lenkjå direkte?' }).click();
        await expect(hero.getByRole('link', { name: 'Opne lenkjå direkte' })).toHaveAttribute('href', link);
        await expect(hero.getByRole('list', { name: 'Sånn kjem du inn' }).getByRole('listitem')).toHaveText([
            'Kopier lenkjå med knappen.',
            'Opne Blobby Volley.',
            'Trykk på "join link" øvst i hovudmenyen.',
            'Svar Yes.',
        ]);
        // The server and the own code, for typing in by hand.
        await expect(hero).toContainText('"online game" eller "lan game", så "direct connect"');
        await expect(hero.getByRole('definition').filter({ hasText: 'e2e-server.lan:1234' })).toBeVisible();
        await expect(hero.getByRole('definition').filter({ hasText: codeOf(own) })).toHaveText(codeOf(own));
        // A player never sees the code of the other player.
        expect(await player.page.content()).not.toContain(codeOf(other));
    }
    await asker.context.close();
    await asked.context.close();
});

test('the asked player declines a 1v1, the asker withdraws the next one, and the pair can try again', async ({ browser }) => {
    const tag = randomBytes(2).toString('hex');
    const asker = await signUp(browser, `Da${tag}`);
    const asked = await signUp(browser, `Db${tag}`);
    await asker.page.goto('/me');
    const form = asker.page.getByRole('region', { name: 'Utfordra någen te 1v1' });
    await form.getByLabel('Motstandar').selectOption({ label: `Db${tag}` });
    await form.getByRole('button', { name: 'Send utfordring' }).click();
    await expect(asker.page.getByRole('status')).toHaveText('Utfordringå e sendt. Nå e det opp te motstandaren.');

    await asked.page.goto('/me');
    const incoming = asked.page.getByRole('listitem').filter({ hasText: `Da${tag} utfordre deg!` });
    await expect(incoming).toContainText('Best av 1 · først te 15 · 75 fps');
    await incoming.getByRole('button', { name: 'Nei takk' }).click();
    await expect(asked.page.getByRole('status')).toHaveText('Du sa nei takk. Kampen e avlyst.');
    await expect(asked.page.getByRole('listitem').filter({ hasText: `Da${tag} utfordre deg!` })).toHaveCount(0);

    await asker.page.goto('/me');
    await expect(asker.page.getByText(`Du vente på svar frå Db${tag}`)).toHaveCount(0);
    await form.getByLabel('Motstandar').selectOption({ label: `Db${tag}` });
    await form.getByRole('button', { name: 'Send utfordring' }).click();
    await expect(asker.page.getByRole('status')).toHaveText('Utfordringå e sendt. Nå e det opp te motstandaren.');

    // The asker takes the new request back before it is answered.
    const outgoing = asker.page.getByRole('list', { name: 'Utfordringa frå deg' }).getByRole('listitem').filter({ hasText: `Du vente på svar frå Db${tag}` });
    await outgoing.getByRole('button', { name: 'Trekk tebake' }).click();
    await expect(asker.page.getByRole('status')).toHaveText('Du trakk utfordringå tebake.');
    await expect(asker.page.getByText(`Du vente på svar frå Db${tag}`)).toHaveCount(0);
    await asked.page.goto('/me');
    await expect(asked.page.getByRole('listitem').filter({ hasText: `Da${tag} utfordre deg!` })).toHaveCount(0);

    await form.getByLabel('Motstandar').selectOption({ label: `Db${tag}` });
    await form.getByRole('button', { name: 'Send utfordring' }).click();
    await expect(asker.page.getByRole('status')).toHaveText('Utfordringå e sendt. Nå e det opp te motstandaren.');
    await asker.context.close();
    await asked.context.close();
});

test('a player sees the bracket of a tournament with the own match marked', async ({ browser, baseURL }) => {
    const tag = randomBytes(2).toString('hex');
    const nicknames = [`Ka${tag}`, `Kb${tag}`, `Kc${tag}`];
    const players = [];
    for (const nickname of nicknames) players.push(await signUp(browser, nickname));

    const admin = await adminContext(browser, baseURL!);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/tournaments/new');
    const name = `Pizza cup ${tag}`;
    await adminPage.getByLabel('Name').fill(name);
    for (const nickname of nicknames) await adminPage.getByRole('checkbox', { name: nickname }).check();
    await adminPage.getByRole('button', { name: 'Preview' }).click();
    await adminPage.getByRole('button', { name: 'Save tournament' }).click();
    await expect(adminPage.getByRole('heading', { level: 1, name })).toBeVisible();
    const tournamentId = adminPage.url().match(/\/admin\/tournaments\/(\d+)/)![1];
    await admin.close();

    const { page } = players[0];
    await page.goto(`/bracket?t=${tournamentId}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText('3 spelara · enkelt utslag · tilfeldig oppsett · først te 15 · 75 fps')).toBeVisible();
    // Three players: one first round match, and the top seed waits in the final.
    await expect(page.getByRole('region', { name: 'Semifinala' }).getByRole('article')).toHaveCount(1);
    const final = page.getByRole('region', { name: 'Finale' }).getByRole('article');
    await expect(final).toHaveCount(1);
    await expect(final).toContainText('Vinnar av kamp 1');
    await expect(page.getByRole('region', { name: 'Mester' })).toContainText('Kem vinne?');
    const own = page.getByRole('article', { name: new RegExp(nicknames[0]) }).first();
    await expect(own).toBeVisible();

    // A match open for bets links to its bet form on the matches page.
    const bettable = page.getByRole('link', { name: 'Sats nå' }).first();
    const href = await bettable.getAttribute('href');
    expect(href).toMatch(/^\/me#kamp-\d+$/);
    await bettable.click();
    await expect(page).toHaveURL(/\/me#kamp-\d+$/);
    await expect(page.locator(href!.slice(3))).toBeVisible();
    for (const player of players) await player.context.close();
});

test('the bracket page sends a visitor without a session to sign-in', async ({ page }) => {
    await page.goto('/bracket');
    await expect(page).toHaveURL(/\/login$/);
});

test('a player who signed up the day before is told on /me that they got the daily Foza for today', async ({ browser }) => {
    const nickname = `Ud${randomBytes(2).toString('hex')}`;
    const player = await signUp(browser, nickname);
    // Moves the sign-up a day back in the test database, so today is a day with daily Foza.
    const db = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
    try {
        await db.query(`UPDATE players SET created_at = created_at - interval '1 day' WHERE nickname = $1`, [nickname]);
    } finally {
        await db.end();
    }

    await player.page.goto('/me');
    await expect(player.page.getByRole('status').filter({ hasText: 'Du fekk 100 Foza for i dag!' })).toBeVisible();
    await expect(player.page.getByText('Du får 100 Foza kvar dag du e med.')).toHaveCount(0);
    // A later visit the same day still tells it, and pays nothing more.
    await player.page.reload();
    await expect(player.page.getByText('Du fekk 100 Foza for i dag!')).toBeVisible();
    const balance = await player.page.request.get('/api/player/balance');
    expect(await balance.json()).toMatchObject({ balance: 1100 });
    await player.context.close();
});
