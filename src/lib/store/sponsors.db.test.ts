import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, MIGRATIONS_DIR, readMigrations } from '../../../scripts/migrate.mjs';
import type { EventInput } from '@/lib/events/input';
import { BMP_HEADER_BYTES, encodeBmp32, readBmpInfo } from '@/lib/sponsors/bmp';
import type { SponsorInput } from '@/lib/sponsors/input';
import { checkLogo, makeGameLogo, type CheckedLogo } from '@/lib/sponsors/logo';
import { createEvent, getEvent, setActiveEvent, setGameBoard } from './events';
import { createSponsor, deleteSponsor, getSponsorLogo, listServerSponsors, listShownSponsors, listSponsors, LOGO_UPGRADE_TRIES, MAX_SPONSORS, moveSponsor, newLogoUpgradeState, updateSponsor, upgradeGameLogos, upgradeGameLogosOnce } from './sponsors';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };
const input = (name: string, change: Partial<SponsorInput> = {}): SponsorInput => ({ name, link: null, enabled: true, gameBackground: '#ffffff', ...change });
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

let logo: CheckedLogo;
let otherLogo: CheckedLogo;
const gameLogo = encodeBmp32(new Uint8Array(32 * 32 * 4), 32, 32);

async function checked(colour: string, channels: 3 | 4 = 3): Promise<CheckedLogo> {
    const background = channels === 3 ? colour : { r: 0, g: 0, b: 0, alpha: 0 };
    const result = await checkLogo(new Uint8Array(await sharp({ create: { width: 60, height: 20, channels, background } }).png().toBuffer()));
    if (!result.ok) throw new Error(result.error);
    return result.value;
}

beforeAll(async () => {
    logo = await checked('#ff0000');
    otherLogo = await checked('#0000ff');
});

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

async function add(eventId: number, name: string, change: Partial<SponsorInput> = {}): Promise<number> {
    const result = await createSponsor(pool, eventId, input(name, change), logo, gameLogo);
    if (!result.ok) throw new Error(result.error);
    return result.id;
}

const names = async (eventId: number) => (await listSponsors(pool, eventId)).map((s) => s.name);

describe('sponsors', () => {
    it('adds sponsors at the end and lists them in order with the logo hashes', async () => {
        const eventId = await createEvent(pool, lan);
        await add(eventId, 'Acme', { link: 'https://acme.example.test/' });
        await add(eventId, 'Beta', { enabled: false });
        const list = await listSponsors(pool, eventId);
        expect(list.map((s) => [s.name, s.position, s.enabled, s.link])).toEqual([
            ['Acme', 1, true, 'https://acme.example.test/'],
            ['Beta', 2, false, null],
        ]);
        expect(list[0]).toMatchObject({ logoType: 'image/png', logoWidth: 60, logoHeight: 20, logoHash: sha256(logo.bytes), gameLogoHash: sha256(gameLogo) });
    });

    it('refuses an event that does not exist and more than the limit', async () => {
        expect(await createSponsor(pool, 999, input('Acme'), logo, gameLogo)).toEqual({ ok: false, error: 'not-found' });
        const eventId = await createEvent(pool, lan);
        for (let i = 0; i < MAX_SPONSORS; i++) await add(eventId, `S${i}`);
        expect(await createSponsor(pool, eventId, input('One more'), logo, gameLogo)).toEqual({ ok: false, error: 'limit' });
    });

    it('keeps two sponsors that are added at once in their own positions', async () => {
        const eventId = await createEvent(pool, lan);
        await Promise.all(['A', 'B', 'C', 'D'].map((name) => add(eventId, name)));
        expect((await listSponsors(pool, eventId)).map((s) => s.position)).toEqual([1, 2, 3, 4]);
    });

    it('moves a sponsor up and down, and the ends stay put', async () => {
        const eventId = await createEvent(pool, lan);
        const [a, , c] = [await add(eventId, 'A'), await add(eventId, 'B'), await add(eventId, 'C')];
        expect(await moveSponsor(pool, c, 'up')).toBe(eventId);
        expect(await names(eventId)).toEqual(['A', 'C', 'B']);
        await moveSponsor(pool, a, 'down');
        expect(await names(eventId)).toEqual(['C', 'A', 'B']);
        await moveSponsor(pool, c, 'up');
        await moveSponsor(pool, (await listSponsors(pool, eventId))[2].id, 'down');
        expect(await names(eventId)).toEqual(['C', 'A', 'B']);
        expect(await moveSponsor(pool, 999, 'up')).toBeNull();
    });

    it('moves around a gap left by a delete', async () => {
        const eventId = await createEvent(pool, lan);
        const [, b, c] = [await add(eventId, 'A'), await add(eventId, 'B'), await add(eventId, 'C')];
        expect(await deleteSponsor(pool, b)).toBe(eventId);
        await moveSponsor(pool, c, 'up');
        expect(await names(eventId)).toEqual(['C', 'A']);
        expect(await deleteSponsor(pool, b)).toBeNull();
    });

    it('changes a sponsor and keeps the logo when no new one is given', async () => {
        const eventId = await createEvent(pool, lan);
        const id = await add(eventId, 'Acme');
        const newGameLogo = encodeBmp32(new Uint8Array(40 * 32 * 4).fill(9), 40, 32);
        expect(await updateSponsor(pool, id, input('Acme AS', { link: 'https://acme.example.test/', enabled: false, gameBackground: '#000000' }), null, newGameLogo)).toBe(eventId);
        const [kept] = await listSponsors(pool, eventId);
        expect(kept).toMatchObject({ name: 'Acme AS', enabled: false, gameBackground: '#000000', logoHash: sha256(logo.bytes), gameLogoHash: sha256(newGameLogo) });

        await updateSponsor(pool, id, input('Acme AS'), otherLogo, gameLogo);
        const stored = await getSponsorLogo(pool, id);
        expect(new Uint8Array(stored!.bytes)).toEqual(otherLogo.bytes);
        expect(stored).toMatchObject({ type: 'image/png', hash: sha256(otherLogo.bytes), width: 60, height: 20, eventId, enabled: true, eventActive: false });
        expect(await updateSponsor(pool, 999, input('X'), null, gameLogo)).toBeNull();
    });

    it('shows only the enabled sponsors of the active event', async () => {
        const active = await createEvent(pool, lan);
        const other = await createEvent(pool, { ...lan, name: 'LAN 2027', code: 'LAN-2027' });
        expect(await listShownSponsors(pool)).toEqual([]);
        expect(await listServerSponsors(pool)).toEqual({ eventId: null, gameBoard: 'off', sponsors: [] });
        await setActiveEvent(pool, active);
        await setGameBoard(pool, active, 'led');
        expect(await listServerSponsors(pool)).toEqual({ eventId: active, gameBoard: 'led', sponsors: [] });
        await add(active, 'Off', { enabled: false });
        const b = await add(active, 'B');
        const a = await add(active, 'A');
        await add(other, 'Elsewhere');
        await moveSponsor(pool, a, 'up');
        expect((await listShownSponsors(pool)).map((s) => s.name)).toEqual(['A', 'B']);
        const server = await listServerSponsors(pool);
        expect(server.eventId).toBe(active);
        expect(server.sponsors.map((s) => [s.sponsorId, s.name, s.gameLogoHash])).toEqual([
            [a, 'A', sha256(gameLogo)],
            [b, 'B', sha256(gameLogo)],
        ]);
        expect(new Uint8Array(server.sponsors[0].gameLogo)).toEqual(gameLogo);
    });

    it('stores a game logo made from the upload', async () => {
        const eventId = await createEvent(pool, lan);
        await setActiveEvent(pool, eventId);
        await setGameBoard(pool, eventId, 'wood');
        const made = await makeGameLogo(logo, null);
        await createSponsor(pool, eventId, input('Acme'), logo, made);
        const [sponsor] = (await listServerSponsors(pool)).sponsors;
        expect(readBmpInfo(new Uint8Array(sponsor.gameLogo))).toEqual({ width: 96, height: 32, bitsPerPixel: 32 });
    });

    it('stores a sponsor with no own game background as null', async () => {
        const eventId = await createEvent(pool, lan);
        await add(eventId, 'Acme', { gameBackground: null });
        expect((await listSponsors(pool, eventId))[0].gameBackground).toBeNull();
    });

    it('keeps the sponsors from the game while the board is off, but not from the footer', async () => {
        const eventId = await createEvent(pool, lan);
        await setActiveEvent(pool, eventId);
        const id = await add(eventId, 'Acme');
        expect((await getEvent(pool, eventId))?.gameBoard).toBe('off');
        expect(await listServerSponsors(pool)).toEqual({ eventId, gameBoard: 'off', sponsors: [] });
        expect((await listShownSponsors(pool)).map((s) => s.id)).toEqual([id]);

        expect(await setGameBoard(pool, eventId, 'printed')).toBe(true);
        expect(await listServerSponsors(pool)).toMatchObject({ eventId, gameBoard: 'printed', sponsors: [{ sponsorId: id, name: 'Acme' }] });
        expect(await setGameBoard(pool, eventId, 'off')).toBe(true);
        expect((await listServerSponsors(pool)).sponsors).toEqual([]);
        expect(await setGameBoard(pool, 999, 'led')).toBe(false);
    });

    it('refuses a board style the game does not know', async () => {
        const eventId = await createEvent(pool, lan);
        await expect(pool.query("UPDATE events SET game_board = 'neon' WHERE id = $1", [eventId])).rejects.toThrow(/events_game_board_check/);
    });
});

describe('game logos from before the alpha channel', () => {
    /** A 24-bit BMP as the site stored it before, all one colour. */
    function oldBmp(width: number): Buffer {
        const stride = Math.ceil((width * 3) / 4) * 4;
        const bmp = Buffer.alloc(54 + stride * 32, 0xee);
        bmp.write('BM', 0, 'latin1');
        bmp.writeUInt32LE(bmp.length, 2);
        bmp.writeUInt32LE(54, 10);
        bmp.writeUInt32LE(40, 14);
        bmp.writeInt32LE(width, 18);
        bmp.writeInt32LE(32, 22);
        bmp.writeUInt16LE(1, 26);
        bmp.writeUInt16LE(24, 28);
        bmp.writeUInt32LE(0, 30);
        return bmp;
    }

    async function migrateFromBefore(): Promise<number> {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
        try {
            for (const { name } of readMigrations().filter((m) => m.name < '0010')) copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
            await migrate(pool, dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        // Plain inserts, since the store functions write columns that later migrations add.
        const eventId = (
            await pool.query<{ id: number }>(
                `INSERT INTO events (name, starts_on, ends_on, code, starting_foza, daily_foza, is_active) VALUES ('LAN 2026', '2026-11-20', '2026-11-22', 'LAN-2026', 0, 0, true) RETURNING id`,
            )
        ).rows[0].id;
        const clear = await checked('#000000', 4);
        for (const [position, background] of [
            [1, '#ffffff'],
            [2, '#ff0000'],
        ] as const) {
            await pool.query(
                `INSERT INTO sponsors (event_id, name, position, logo, logo_type, logo_width, logo_height, game_background, game_logo) VALUES ($1, $2, $3, $4, 'image/png', 60, 20, $5, $6)`,
                [eventId, `S${position}`, position, Buffer.from(clear.bytes), background, oldBmp(96)],
            );
        }
        expect(await migrate(pool)).toContain('0010_game_board.sql');
        return eventId;
    }

    it('turns the old white default into no own background, and keeps another colour', async () => {
        const eventId = await migrateFromBefore();
        expect((await listSponsors(pool, eventId)).map((s) => s.gameBackground)).toEqual([null, '#ff0000']);
        expect((await getEvent(pool, eventId))?.gameBoard).toBe('off');
    });

    it('are made again once from the stored logos, transparent or on the own colour', async () => {
        const eventId = await migrateFromBefore();
        await setGameBoard(pool, eventId, 'led');
        const before = (await listServerSponsors(pool)).sponsors.map((s) => readBmpInfo(new Uint8Array(s.gameLogo))?.bitsPerPixel);
        expect(before).toEqual([24, 24]);
        expect(await upgradeGameLogos(pool, makeGameLogo)).toEqual({ made: 2, failed: [] });
        const after = (await listServerSponsors(pool)).sponsors.map((s) => new Uint8Array(s.gameLogo));
        expect(after.map((bmp) => readBmpInfo(bmp))).toEqual([
            { width: 96, height: 32, bitsPerPixel: 32 },
            { width: 96, height: 32, bitsPerPixel: 32 },
        ]);
        // Blue, green, red, alpha of the first pixel.
        expect(Array.from(after[0].slice(BMP_HEADER_BYTES, BMP_HEADER_BYTES + 4))).toEqual([0, 0, 0, 0]);
        expect(Array.from(after[1].slice(BMP_HEADER_BYTES, BMP_HEADER_BYTES + 4))).toEqual([0, 0, 255, 255]);
        expect(await upgradeGameLogos(pool, makeGameLogo)).toEqual({ made: 0, failed: [] });
    });

    it('leaves a logo that cannot be made as it is and names it', async () => {
        await migrateFromBefore();
        const result = await upgradeGameLogos(pool, async () => {
            throw new Error('broken');
        });
        expect(result.made).toBe(0);
        expect(result.failed).toHaveLength(2);
        expect(await upgradeGameLogos(pool, makeGameLogo, [result.failed[0]])).toEqual({ made: 1, failed: [] });
        expect(await upgradeGameLogos(pool, makeGameLogo)).toEqual({ made: 1, failed: [] });
    });

    it('runs once per process when every logo is made', async () => {
        await migrateFromBefore();
        const state = newLogoUpgradeState();
        let calls = 0;
        const counting: typeof makeGameLogo = (logo, background) => {
            calls++;
            return makeGameLogo(logo, background);
        };
        await Promise.all([upgradeGameLogosOnce(pool, counting, state), upgradeGameLogosOnce(pool, counting, state)]);
        expect(calls).toBe(2);
        expect(state.done).toBe(true);
        await pool.query('UPDATE sponsors SET game_logo = set_byte(game_logo, 28, 24)');
        await upgradeGameLogosOnce(pool, counting, state);
        expect(calls).toBe(2);
    });

    it('stops trying a logo that keeps failing, with a log line', async () => {
        await migrateFromBefore();
        const state = newLogoUpgradeState();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let calls = 0;
        const broken = async () => {
            calls++;
            throw new Error('broken');
        };
        try {
            for (let i = 0; i < LOGO_UPGRADE_TRIES + 2; i++) await upgradeGameLogosOnce(pool, broken, state);
            expect(calls).toBe(2 * LOGO_UPGRADE_TRIES);
            expect(state.done).toBe(true);
            expect(warn).toHaveBeenCalledTimes(2);
            expect(warn.mock.calls[0][0]).toMatch(/could not be made again after 3 tries/);
        } finally {
            warn.mockRestore();
        }
    });
});

describe('the game logo size', () => {
    it('allows a 160 by 32 BMP with alpha and nothing larger', async () => {
        const eventId = await createEvent(pool, lan);
        const id = await add(eventId, 'Acme');
        const widest = encodeBmp32(new Uint8Array(160 * 32 * 4), 160, 32);
        expect(widest.length).toBe(20602);
        await pool.query('UPDATE sponsors SET game_logo = $2 WHERE id = $1', [id, Buffer.from(widest)]);
        await expect(pool.query('UPDATE sponsors SET game_logo = $2 WHERE id = $1', [id, Buffer.alloc(20603)])).rejects.toThrow(/sponsors_game_logo_check/);
    });
});

describe('the sponsors table', () => {
    const insert = (eventId: number, change: Record<string, unknown> = {}) => {
        const row = { name: 'Acme', link: null, position: 1, logo: Buffer.from(logo.bytes), logo_type: 'image/png', game_background: '#ffffff', game_logo: Buffer.from(gameLogo), ...change };
        return pool.query(
            `INSERT INTO sponsors (event_id, name, link, position, logo, logo_type, logo_width, logo_height, game_background, game_logo) VALUES ($1, $2, $3, $4, $5, $6, 60, 20, $7, $8)`,
            [eventId, row.name, row.link, row.position, row.logo, row.logo_type, row.game_background, row.game_logo],
        );
    };

    it('refuses SVG, a link that is not http, a bad colour, an empty name and a game logo that is too large', async () => {
        const eventId = await createEvent(pool, lan);
        await expect(insert(eventId, { logo_type: 'image/svg+xml' })).rejects.toThrow(/sponsors_logo_type_check/);
        await expect(insert(eventId, { link: 'javascript:alert(1)' })).rejects.toThrow(/sponsors_link_check/);
        await expect(insert(eventId, { game_background: 'white' })).rejects.toThrow(/sponsors_game_background_check/);
        await expect(insert(eventId, { name: ' ' })).rejects.toThrow(/sponsors_name_check/);
        await expect(insert(eventId, { game_logo: Buffer.alloc(20603) })).rejects.toThrow(/sponsors_game_logo_check/);
        await expect(insert(eventId, { logo: Buffer.alloc(1048577) })).rejects.toThrow(/sponsors_logo_check/);
    });

    it('refuses two sponsors of one event in one position, but another event may use it', async () => {
        const first = await createEvent(pool, lan);
        const second = await createEvent(pool, { ...lan, name: 'LAN 2027', code: 'LAN-2027' });
        await insert(first);
        await expect(insert(first)).rejects.toThrow(/sponsors_event_id_position_key/);
        await insert(second);
    });
});
