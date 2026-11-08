import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS_DIR, readMigrations } from '../../../scripts/migrate.mjs';
import type { EventInput } from '@/lib/events/input';
import { encodeBmp32 } from '@/lib/sponsors/bmp';
import type { SponsorInput } from '@/lib/sponsors/input';
import { checkLogo, type CheckedLogo } from '@/lib/sponsors/logo';
import { createEvent, setActiveEvent, setGameBoard } from './events';
import {
    addFromLibrary,
    createLibrarySponsor,
    countLibrary,
    createSponsor,
    deleteLibrarySponsor,
    deleteSponsor,
    getLibraryLogo,
    getSponsorLogo,
    listLibrary,
    listServerSponsors,
    listShownSponsors,
    listSponsors,
    MAX_LIBRARY_SPONSORS,
    MAX_SPONSORS,
    moveSponsor,
    setSponsorShown,
    updateLibrarySponsor,
    updateSponsor,
} from './sponsors';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };
const lan27: EventInput = { ...lan, name: 'LAN 2027', startsOn: '2027-11-20', endsOn: '2027-11-22', code: 'LAN-2027' };
const input = (name: string, change: Partial<SponsorInput> = {}): SponsorInput => ({ name, link: null, enabled: true, gameBackground: null, ...change });
const gameLogo = (fill: number) => encodeBmp32(new Uint8Array(32 * 32 * 4).fill(fill), 32, 32);
/** A game logo maker that always gives the same game logo. */
const made = (fill: number) => async () => gameLogo(fill);

let logo: CheckedLogo;
let otherLogo: CheckedLogo;

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

const down = () => readFileSync(join(MIGRATIONS_DIR, 'down', '0017_sponsor_library.sql'), 'utf8');

/** Applies the migrations numbered before `next`, from a copy of the folder. */
async function migrateBefore(next: string) {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
    try {
        for (const { name } of readMigrations().filter((m) => m.name < next)) copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
        await migrate(pool, dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('the move to the sponsor library', () => {
    // Every column of the sponsors table before the library, as the old code read them.
    const OLD_COLUMNS =
        'id, event_id, name, link, position, enabled, game_background, logo, logo_type, logo_width, logo_height, logo_hash, game_logo, game_logo_hash, created_at, updated_at';
    // The query the game server sync used before the library.
    const OLD_SERVER_QUERY = `SELECT e.id AS event_id, e.game_board, s.id, s.name, s.game_logo, s.game_logo_hash
         FROM events e LEFT JOIN sponsors s ON s.event_id = e.id AND s.enabled AND e.game_board <> 'off'
         WHERE e.is_active
         ORDER BY s.position, s.id`;

    /** Two events with sponsors on the schema before the library. Returns the event ids. */
    async function oldData(): Promise<[number, number]> {
        await migrateBefore('0017');
        const events = await pool.query<{ id: number }>(
            `INSERT INTO events (name, starts_on, ends_on, code, starting_foza, daily_foza, is_active, game_board) VALUES
             ('LAN 2026', '2026-11-20', '2026-11-22', 'LAN-2026', 0, 0, true, 'led'),
             ('LAN 2027', '2027-11-20', '2027-11-22', 'LAN-2027', 0, 0, false, 'off') RETURNING id`,
        );
        const [first, second] = events.rows.map((row) => row.id);
        const rows: [number, string, string | null, number, boolean, string | null, CheckedLogo, number][] = [
            [first, 'Acme', 'https://acme.example.test/', 2, true, null, logo, 1],
            [first, 'Beta', null, 1, true, '#ffe9b0', otherLogo, 2],
            [first, 'Hidden', null, 3, false, null, logo, 3],
            [second, 'Acme', 'https://acme.example.test/', 1, true, null, logo, 4],
        ];
        for (const [eventId, name, link, position, enabled, background, file, fill] of rows) {
            await pool.query(
                `INSERT INTO sponsors (event_id, name, link, position, enabled, game_background, logo, logo_type, logo_width, logo_height, game_logo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [eventId, name, link, position, enabled, background, Buffer.from(file.bytes), file.type, file.width, file.height, Buffer.from(gameLogo(fill))],
            );
        }
        // A deleted sponsor leaves a gap in the ids.
        await pool.query(`DELETE FROM sponsors WHERE name = 'Hidden'`);
        await pool.query(
            `INSERT INTO sponsors (event_id, name, position, enabled, logo, logo_type, logo_width, logo_height, game_logo) VALUES ($1, 'Late', 3, false, $2, 'image/png', 60, 20, $3)`,
            [first, Buffer.from(logo.bytes), Buffer.from(gameLogo(5))],
        );
        return [first, second];
    }

    it('keeps every sponsor with its id, order, logo and colour, and the game sync payload stays the same', async () => {
        const [first, second] = await oldData();
        const before = (await pool.query(`SELECT ${OLD_COLUMNS} FROM sponsors ORDER BY id`)).rows;
        const serverBefore = (await pool.query(OLD_SERVER_QUERY)).rows;
        // This one and the ones after it run.
        expect(await migrate(pool)).toEqual(readMigrations().filter((m) => m.name >= '0017').map((m) => m.name));

        const server = await listServerSponsors(pool);
        expect(server.eventId).toBe(first);
        expect(server.gameBoard).toBe('led');
        expect(server.sponsors.map((s) => ({ id: s.sponsorId, name: s.name, game_logo: Buffer.from(s.gameLogo), game_logo_hash: s.gameLogoHash }))).toEqual(
            serverBefore.map((r) => ({ id: r.id, name: r.name, game_logo: r.game_logo, game_logo_hash: r.game_logo_hash })),
        );
        expect(server.sponsors.map((s) => s.name)).toEqual(['Beta', 'Acme']);

        const after = [...(await listSponsors(pool, first)), ...(await listSponsors(pool, second))].sort((a, b) => a.id - b.id);
        expect(after.map((s) => [s.id, s.eventId, s.libraryId, s.name, s.link, s.position, s.enabled, s.gameBackground, s.logoType, s.logoWidth, s.logoHeight, s.logoHash, s.gameLogoHash])).toEqual(
            before.map((r) => [r.id, r.event_id, r.id, r.name, r.link, r.position, r.enabled, r.game_background, r.logo_type, r.logo_width, r.logo_height, r.logo_hash, r.game_logo_hash]),
        );
        for (const row of before) {
            const stored = await getSponsorLogo(pool, row.id);
            expect(Buffer.from(stored!.bytes)).toEqual(row.logo);
        }
        expect((await listShownSponsors(pool)).map((s) => s.id)).toEqual(serverBefore.map((r) => r.id));

        // A new sponsor gets ids after the copied ones.
        const added = await createSponsor(pool, second, input('New'), logo, gameLogo(9));
        expect(added.ok).toBe(true);
        const fresh = (await listSponsors(pool, second)).find((s) => s.name === 'New')!;
        expect(fresh.libraryId).toBeGreaterThan(Math.max(...before.map((r) => r.id)));
    });

    it('can be turned back with the down file, and the sponsors are as they were', async () => {
        await oldData();
        const before = (await pool.query(`SELECT ${OLD_COLUMNS} FROM sponsors ORDER BY id`)).rows;
        await migrate(pool);
        await pool.query(down());
        expect((await pool.query(`SELECT ${OLD_COLUMNS} FROM sponsors ORDER BY id`)).rows).toEqual(before);
        expect((await pool.query(`SELECT to_regclass('sponsor_library') AS t`)).rows[0].t).toBeNull();
        // And it applies again.
        expect(await migrate(pool)).toEqual(['0017_sponsor_library.sql']);
    });

    it('will not turn back while a library sponsor has no event, and changes nothing then', async () => {
        await oldData();
        await migrate(pool);
        const created = await createLibrarySponsor(pool, input('Only in the library'), logo, gameLogo(1));
        expect(created.ok).toBe(true);
        const client = await pool.connect();
        try {
            await expect(client.query(down())).rejects.toThrow(/sponsors that no event uses/);
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
        expect((await listLibrary(pool)).map((s) => s.name)).toContain('Only in the library');
        expect((await pool.query(`SELECT count(*)::int AS n FROM schema_migrations WHERE name = '0017_sponsor_library.sql'`)).rows[0].n).toBe(1);
    });

    it('is not run from the down folder', () => {
        expect(readMigrations().map((m) => m.name)).not.toContain('down');
        expect(readMigrations().filter((m) => m.name.startsWith('0017'))).toHaveLength(1);
    });
});

describe('the sponsor library', () => {
    async function libraryId(eventId: number, name: string): Promise<number> {
        return (await listSponsors(pool, eventId)).find((s) => s.name === name)!.libraryId;
    }

    it('adds a sponsor once and puts it at the end of other events, shown', async () => {
        const first = await createEvent(pool, lan);
        const second = await createEvent(pool, lan27);
        await createSponsor(pool, first, input('Acme', { link: 'https://acme.example.test/' }), logo, gameLogo(1));
        await createSponsor(pool, second, input('Beta', { enabled: false }), otherLogo, gameLogo(2));
        const acme = await libraryId(first, 'Acme');
        const placed = await addFromLibrary(pool, second, acme);
        expect(placed.ok).toBe(true);
        expect((await listSponsors(pool, second)).map((s) => [s.name, s.position, s.enabled, s.link])).toEqual([
            ['Beta', 1, false, null],
            ['Acme', 2, true, 'https://acme.example.test/'],
        ]);
        expect(await addFromLibrary(pool, second, acme)).toEqual({ ok: false, error: 'taken' });
        expect(await addFromLibrary(pool, second, 9999)).toEqual({ ok: false, error: 'not-found' });
        expect(await addFromLibrary(pool, 9999, acme)).toEqual({ ok: false, error: 'not-found' });
        expect((await listLibrary(pool)).map((s) => [s.name, s.events.map((e) => e.name)])).toEqual([
            ['Acme', ['LAN 2027', 'LAN 2026']],
            ['Beta', ['LAN 2027']],
        ]);
    });

    it('adds no new library sponsor past the limit, on every add path, but rows from the migration may be more', async () => {
        const eventId = await createEvent(pool, lan);
        const fill = (n: number) =>
            pool.query(
                `INSERT INTO sponsor_library (name, logo, logo_type, logo_width, logo_height, game_logo) SELECT 'S' || g, $2, 'image/png', 60, 20, $3 FROM generate_series(1, $1) g`,
                [n, Buffer.from(logo.bytes), Buffer.from(gameLogo(1))],
            );
        await fill(MAX_LIBRARY_SPONSORS - 1);
        expect((await createLibrarySponsor(pool, input('Last'), logo, gameLogo(1))).ok).toBe(true);
        expect(await createLibrarySponsor(pool, input('One more'), logo, gameLogo(1))).toEqual({ ok: false, error: 'library-limit' });
        expect(await createSponsor(pool, eventId, input('Upload'), logo, gameLogo(1))).toEqual({ ok: false, error: 'library-limit' });
        expect(await listSponsors(pool, eventId)).toEqual([]);
        // More rows than the limit, as the migration may leave. Adds stay refused, and the library still works.
        await fill(20);
        expect(await countLibrary(pool)).toBe(MAX_LIBRARY_SPONSORS + 20);
        expect(await createSponsor(pool, eventId, input('Upload'), logo, gameLogo(1))).toEqual({ ok: false, error: 'library-limit' });
        const last = (await listLibrary(pool)).find((s) => s.name === 'Last')!;
        expect((await addFromLibrary(pool, eventId, last.id)).ok).toBe(true);
    });

    it('adds one at a time, so two adds at once cannot pass the limit together', async () => {
        await pool.query(
            `INSERT INTO sponsor_library (name, logo, logo_type, logo_width, logo_height, game_logo) SELECT 'S' || g, $2, 'image/png', 60, 20, $3 FROM generate_series(1, $1) g`,
            [MAX_LIBRARY_SPONSORS - 1, Buffer.from(logo.bytes), Buffer.from(gameLogo(1))],
        );
        const results = await Promise.all([createLibrarySponsor(pool, input('A'), logo, gameLogo(1)), createLibrarySponsor(pool, input('B'), logo, gameLogo(1))]);
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        expect(await countLibrary(pool)).toBe(MAX_LIBRARY_SPONSORS);
    });

    it('turns Shown on one event without touching the library or other events', async () => {
        const first = await createEvent(pool, lan);
        const second = await createEvent(pool, lan27);
        await createSponsor(pool, first, input('Acme', { link: 'https://acme.example.test/', gameBackground: '#123456' }), logo, gameLogo(1));
        const id = await libraryId(first, 'Acme');
        await addFromLibrary(pool, second, id);
        const libraryRow = async () => (await pool.query('SELECT * FROM sponsor_library WHERE id = $1', [id])).rows[0];
        const [rowBefore, secondBefore] = [await libraryRow(), await listSponsors(pool, second)];
        const atFirst = (await listSponsors(pool, first))[0];
        expect(await setSponsorShown(pool, atFirst.id, false)).toBe(first);
        expect((await listSponsors(pool, first))[0]).toEqual({ ...atFirst, enabled: false });
        expect(await libraryRow()).toEqual(rowBefore);
        expect(await listSponsors(pool, second)).toEqual(secondBefore);
    });

    it('makes the game logo from the logo that is stored, when two saves come at once', async () => {
        const eventId = await createEvent(pool, lan);
        await createSponsor(pool, eventId, input('Acme'), logo, gameLogo(1));
        const id = await libraryId(eventId, 'Acme');
        // A slow maker that marks the game logo with the logo it was made from.
        const slow = async (from: CheckedLogo) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return gameLogo(Buffer.from(from.bytes).equals(Buffer.from(otherLogo.bytes)) ? 2 : 1);
        };
        await Promise.all([updateLibrarySponsor(pool, id, input('Acme'), otherLogo, slow), updateLibrarySponsor(pool, id, input('Acme'), null, slow)]);
        const row = (await pool.query<{ logo: Buffer; game_logo: Buffer }>('SELECT logo, game_logo FROM sponsor_library WHERE id = $1', [id])).rows[0];
        const fromOther = row.logo.equals(Buffer.from(otherLogo.bytes));
        expect(row.game_logo.equals(Buffer.from(gameLogo(fromOther ? 2 : 1)))).toBe(true);
        expect(fromOther).toBe(true);
    });

    it('refuses a full event', async () => {
        const first = await createEvent(pool, lan);
        const second = await createEvent(pool, lan27);
        for (let i = 0; i < MAX_SPONSORS; i++) await createSponsor(pool, first, input(`S${i}`), logo, gameLogo(1));
        const created = await createLibrarySponsor(pool, input('Extra'), logo, gameLogo(1));
        if (!created.ok) throw new Error(created.error);
        expect(await addFromLibrary(pool, first, created.id)).toEqual({ ok: false, error: 'limit' });
        // A full event adds nothing to the library either.
        expect(await createSponsor(pool, first, input('One more'), logo, gameLogo(1))).toEqual({ ok: false, error: 'limit' });
        expect((await listLibrary(pool)).some((s) => s.name === 'One more')).toBe(false);
        expect((await addFromLibrary(pool, second, created.id)).ok).toBe(true);
    });

    it('changes the name, link, logo and colour at every event, but Shown only at one', async () => {
        const first = await createEvent(pool, lan);
        const second = await createEvent(pool, lan27);
        await createSponsor(pool, first, input('Acme'), logo, gameLogo(1));
        await addFromLibrary(pool, second, await libraryId(first, 'Acme'));
        const atFirst = (await listSponsors(pool, first))[0];
        await updateSponsor(pool, atFirst.id, input('Acme Pizza', { enabled: false, gameBackground: '#123456' }), otherLogo, made(7));
        const [a, b] = [(await listSponsors(pool, first))[0], (await listSponsors(pool, second))[0]];
        expect([a.name, a.enabled, a.gameBackground]).toEqual(['Acme Pizza', false, '#123456']);
        expect([b.name, b.enabled, b.gameBackground, b.logoHash]).toEqual(['Acme Pizza', true, '#123456', a.logoHash]);
        expect(await updateSponsor(pool, 9999, input('X'), null, made(1))).toBe('not-found');

        expect(await updateLibrarySponsor(pool, a.libraryId, input('Acme AS', { link: 'https://acme.example.test/' }), null, made(8))).toBe('saved');
        expect((await listSponsors(pool, second))[0]).toMatchObject({ name: 'Acme AS', link: 'https://acme.example.test/', enabled: true, logoHash: a.logoHash });
        expect(await updateLibrarySponsor(pool, 9999, input('X'), null, made(1))).toBe('not-found');
        expect(Buffer.from((await getLibraryLogo(pool, a.libraryId))!.bytes)).toEqual(Buffer.from(otherLogo.bytes));
    });

    it('keeps a sponsor in the library when an event removes it, and deletes it only when no event uses it', async () => {
        const first = await createEvent(pool, lan);
        await setActiveEvent(pool, first);
        await setGameBoard(pool, first, 'led');
        await createSponsor(pool, first, input('Acme'), logo, gameLogo(1));
        await createSponsor(pool, first, input('Beta'), logo, gameLogo(2));
        const [acme, beta] = await listSponsors(pool, first);
        expect(await deleteLibrarySponsor(pool, acme.libraryId)).toBe('in-use');
        expect(await deleteSponsor(pool, acme.id)).toBe(first);
        expect((await listServerSponsors(pool)).sponsors.map((s) => s.name)).toEqual(['Beta']);
        expect((await listLibrary(pool)).map((s) => [s.name, s.events.length])).toEqual([
            ['Acme', 0],
            ['Beta', 1],
        ]);
        // Back at the event at the end, and the order works around the gap.
        await addFromLibrary(pool, first, acme.libraryId);
        expect((await listSponsors(pool, first)).map((s) => s.name)).toEqual(['Beta', 'Acme']);
        await moveSponsor(pool, (await listSponsors(pool, first))[1].id, 'up');
        expect((await listServerSponsors(pool)).sponsors.map((s) => s.name)).toEqual(['Acme', 'Beta']);
        await deleteSponsor(pool, (await listSponsors(pool, first)).find((s) => s.name === 'Acme')!.id);
        expect(await deleteLibrarySponsor(pool, acme.libraryId)).toBe('deleted');
        expect(await deleteLibrarySponsor(pool, acme.libraryId)).toBe('not-found');
        expect(await getLibraryLogo(pool, beta.libraryId)).not.toBeNull();
    });
});
