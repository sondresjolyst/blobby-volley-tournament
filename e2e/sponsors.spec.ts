import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';

test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
        { name: '__Secure-next-auth.session-token', value: process.env.E2E_ADMIN_TOKEN ?? '', domain: new URL(baseURL!).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
});

const auth = () => ({ authorization: `Bearer ${process.env.E2E_GAME_SERVER_TOKEN ?? ''}` });

interface ServerSponsors {
    eventId: number | null;
    gameBoard: string;
    sponsorsVersion: string;
    sponsors: { sponsorId: number; name: string; logo: { format: string; width: number; height: number; bitsPerPixel: number; hash: string; data: string } }[];
}

async function readSponsors(request: APIRequestContext): Promise<ServerSponsors> {
    const res = await request.get('/api/server/sponsors', { headers: auth() });
    expect(res.status()).toBe(200);
    return res.json();
}

const png = async (width: number, height: number, colour: string) => sharp({ create: { width, height, channels: 4, background: colour } }).png().toBuffer();

test('an admin adds, orders, turns off and deletes sponsors, and the footer and the game server follow', async ({ page, request }) => {
    const tag = randomBytes(3).toString('hex');
    const first = `Acme ${tag}`;
    const second = `Beta ${tag}`;

    await page.goto('/admin/events');
    await page.getByRole('row', { name: /E2E LAN/ }).getByRole('link').click();
    await expect(page).toHaveURL(/\/admin\/events\/\d+$/);

    // The board is off until an admin picks a style.
    const board = page.getByLabel('Sponsor board in the game');
    await expect(board).toHaveValue('off');
    expect((await readSponsors(request)).gameBoard).toBe('off');
    await board.selectOption({ label: 'Dark LED with metal frame' });
    await page.getByRole('button', { name: 'Change board' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved the sponsor board.');
    await expect(board).toHaveValue('led');

    // SVG is refused whatever the browser says the file is.
    await page.getByLabel('Name of the new sponsor').fill(first);
    await page.getByLabel('Logo of the new sponsor').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
    await page.getByRole('button', { name: 'Add sponsor' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The logo must be a PNG, JPEG or WebP file. SVG is not allowed.' })).toBeVisible();

    for (const [name, colour] of [
        [first, '#cc0000'],
        [second, '#0000cc'],
    ]) {
        await page.getByLabel('Name of the new sponsor').fill(name);
        await page.getByLabel('Link of the new sponsor').fill(`https://${tag}.example.test/${name.split(' ')[0].toLowerCase()}`);
        await page.getByLabel('Logo of the new sponsor').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await png(300, 100, colour) });
        await page.getByRole('button', { name: 'Add sponsor' }).click();
        await expect(page.getByRole('status')).toHaveText(`Saved the sponsor ${name}.`);
    }
    // The admin preview loads through the admin route, which needs the session.
    const preview = page.getByRole('img', { name: `Logo of ${first}` });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(300);

    // The footer of a public page shows both, in order, with their links.
    const home = await page.context().browser()!.newContext({ baseURL: process.env.E2E_BASE_URL });
    const homePage = await home.newPage();
    await homePage.goto('/');
    const footer = homePage.getByRole('contentinfo', { name: 'Sponsora' });
    await expect(footer.getByRole('link', { name: first })).toHaveAttribute('href', `https://${tag}.example.test/acme`);
    await expect.poll(() => footer.getByRole('img', { name: first }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(300);
    const alts = await footer.getByRole('img').evaluateAll((imgs) => imgs.map((img) => img.getAttribute('alt')));
    expect(alts.indexOf(first)).toBeLessThan(alts.indexOf(second));
    const src = await footer.getByRole('img', { name: first }).getAttribute('src');
    const logo = await homePage.request.get(src!);
    expect(logo.status()).toBe(200);
    expect(logo.headers()['content-type']).toBe('image/png');
    expect(logo.headers()['x-content-type-options']).toBe('nosniff');
    expect(logo.headers()['cache-control']).toBe('public, max-age=31536000, immutable');

    // The game server gets both with a 96 by 32 BMP with alpha and the hash of it.
    let sync = await readSponsors(request);
    const ours = () => sync.sponsors.filter((s) => s.name.endsWith(tag));
    expect(sync.gameBoard).toBe('led');
    expect(ours().map((s) => s.name)).toEqual([first, second]);
    for (const sponsor of ours()) {
        const bmp = Buffer.from(sponsor.logo.data, 'base64');
        expect(bmp.subarray(0, 2).toString('latin1')).toBe('BM');
        expect([bmp.readUInt32LE(14), bmp.readInt32LE(18), bmp.readInt32LE(22), bmp.readUInt16LE(28), bmp.readUInt32LE(30)]).toEqual([108, 96, 32, 32, 3]);
        // The logos are opaque, so the alpha of the first pixel is 255.
        expect(bmp[122 + 3]).toBe(255);
        expect(sponsor.logo).toMatchObject({ format: 'bmp', width: 96, height: 32, bitsPerPixel: 32, hash: createHash('sha256').update(bmp).digest('hex') });
    }

    // With the board off the game gets no sponsors and a new version, but the footer keeps them.
    const onVersion = sync.sponsorsVersion;
    await board.selectOption('off');
    await page.getByRole('button', { name: 'Change board' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved the sponsor board.');
    sync = await readSponsors(request);
    expect(sync).toMatchObject({ eventId: expect.any(Number), gameBoard: 'off', sponsors: [] });
    expect(sync.sponsorsVersion).not.toBe(onVersion);
    await homePage.goto('/');
    await expect(footer.getByRole('img', { name: first })).toBeVisible();
    await board.selectOption({ label: 'Wooden beach bar' });
    await page.getByRole('button', { name: 'Change board' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved the sponsor board.');
    sync = await readSponsors(request);
    expect(sync.gameBoard).toBe('wood');
    expect(ours().map((s) => s.name)).toEqual([first, second]);

    // Move the second one up.
    await page.getByRole('button', { name: `Move ${second} up` }).click();
    sync = await readSponsors(request);
    expect(ours().map((s) => s.name)).toEqual([second, first]);

    // Turn the first one off. It leaves the footer and the game, but stays on the admin page.
    const version = sync.sponsorsVersion;
    await page.getByLabel(`Show ${first}`).uncheck();
    await page.getByRole('button', { name: `Save ${first}` }).click();
    await expect(page.getByRole('status')).toHaveText(`Saved the sponsor ${first}.`);
    sync = await readSponsors(request);
    expect(ours().map((s) => s.name)).toEqual([second]);
    expect(sync.sponsorsVersion).not.toBe(version);
    await homePage.goto('/');
    await expect(footer.getByRole('img', { name: second })).toBeVisible();
    await expect(footer.getByRole('img', { name: first })).toHaveCount(0);
    expect((await homePage.request.get(src!)).status()).toBe(404);

    // Delete both.
    for (const name of [first, second]) {
        await page.getByRole('button', { name: `Delete ${name}` }).click();
        await expect(page.getByRole('status')).toHaveText('The sponsor is deleted.');
    }
    await expect(page).toHaveURL(/\/admin\/events\/\d+\?sponsorDeleted=1#sponsors$/);
    sync = await readSponsors(request);
    expect(ours()).toEqual([]);
    await home.close();
});

test('the sponsor list for the game server needs its token', async ({ page }) => {
    // The page has an admin session cookie, which must not be enough.
    const res = await page.request.get('/api/server/sponsors', { headers: { authorization: 'Bearer e2e-placeholder-wrong' } });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
});
