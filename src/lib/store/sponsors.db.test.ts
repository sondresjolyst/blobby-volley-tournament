import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../scripts/migrate.mjs';
import type { EventInput } from '@/lib/events/input';
import { encodeBmp24, readBmpSize } from '@/lib/sponsors/bmp';
import type { SponsorInput } from '@/lib/sponsors/input';
import { checkLogo, makeGameLogo, type CheckedLogo } from '@/lib/sponsors/logo';
import { createEvent, setActiveEvent } from './events';
import { createSponsor, deleteSponsor, getSponsorLogo, listServerSponsors, listShownSponsors, listSponsors, MAX_SPONSORS, moveSponsor, updateSponsor } from './sponsors';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };
const input = (name: string, change: Partial<SponsorInput> = {}): SponsorInput => ({ name, link: null, enabled: true, gameBackground: '#ffffff', ...change });
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

let logo: CheckedLogo;
let otherLogo: CheckedLogo;
const gameLogo = encodeBmp24(new Uint8Array(32 * 32 * 3), 32, 32);

async function checked(colour: string): Promise<CheckedLogo> {
    const result = await checkLogo(new Uint8Array(await sharp({ create: { width: 60, height: 20, channels: 3, background: colour } }).png().toBuffer()));
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
        const newGameLogo = encodeBmp24(new Uint8Array(40 * 32 * 3).fill(9), 40, 32);
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
        expect(await listServerSponsors(pool)).toEqual({ eventId: null, sponsors: [] });
        await setActiveEvent(pool, active);
        expect(await listServerSponsors(pool)).toEqual({ eventId: active, sponsors: [] });
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
        const made = await makeGameLogo(logo, '#ffffff');
        await createSponsor(pool, eventId, input('Acme'), logo, made);
        const [sponsor] = (await listServerSponsors(pool)).sponsors;
        expect(readBmpSize(new Uint8Array(sponsor.gameLogo))).toEqual({ width: 96, height: 32 });
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
        await expect(insert(eventId, { game_logo: Buffer.alloc(15415) })).rejects.toThrow(/sponsors_game_logo_check/);
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
