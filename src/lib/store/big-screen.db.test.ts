import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../scripts/migrate.mjs';
import { generateBracket } from '@/lib/bracket';
import type { EventInput } from '@/lib/events/input';
import { newJoinCode } from '@/lib/players/join-code';
import { encodeBmp32 } from '@/lib/sponsors/bmp';
import { checkLogo } from '@/lib/sponsors/logo';
import { placeBet } from './bets';
import { getBigScreen } from './big-screen';
import { clearActiveEvent, createEvent, setActiveEvent } from './events';
import { addLedger } from './foza';
import { updateLiveScore } from './game-server';
import { callMatch, enterGameResult, listMatches, reportPlayersConnected } from './matches';
import { createSponsor } from './sponsors';
import { saveTournament } from './tournaments';
import { inTransaction } from './transaction';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'JulaLAN', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'OSTAPOPP', startingFoza: 1000, dailyFoza: 0 };
const NOW = new Date('2026-11-20T12:00:00Z');

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

async function addPlayer(eventId: number, nickname: string): Promise<number> {
    return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, created_at, join_code)
             VALUES ($1, $2, $3, '\\x00', '\\x00', 0, $4, $5) RETURNING id`,
            [eventId, nickname, nickname.toLowerCase(), NOW, newJoinCode()],
        );
        await addLedger(client, [{ playerId: rows[0].id, type: 'starting', amount: 1000 }]);
        return rows[0].id;
    });
}

async function setup() {
    const eventId = await createEvent(pool, lan);
    await setActiveEvent(pool, eventId);
    const names = ['Blobfisk', 'Skvett', 'Ostebit', 'Kantina'];
    const ids: number[] = [];
    for (const name of names) ids.push(await addPlayer(eventId, name));
    const bracket = generateBracket({ format: 'single_elimination', players: ids, seeding: { method: 'manual', order: ids }, thirdPlaceMatch: false });
    const saved = await saveTournament(pool, eventId, { name: 'Hovedcupen', seeding: 'manual', randomSeed: null, bracket });
    if (!saved.ok) throw new Error(saved.error);
    const [semi1, semi2] = (await listMatches(pool, eventId)).filter((m) => m.tournamentId === saved.id);
    return { eventId, ids, tournamentId: saved.id, semi1, semi2 };
}

describe('getBigScreen', () => {
    it('is empty when no event is active', async () => {
        await createEvent(pool, lan);
        await clearActiveEvent(pool);
        expect(await getBigScreen(pool)).toMatchObject({ eventId: null, featured: null, others: [], bracket: null, boards: [], sponsors: [] });
    });

    it('shows the live match, the odds of the next one, the bracket, the boards and the sponsors', async () => {
        const { eventId, ids, tournamentId, semi1, semi2 } = await setup();
        const [blobfisk, skvett, ostebit, kantina] = ids;
        // semi1 is Blobfisk against Kantina, semi2 Skvett against Ostebit.
        expect(await placeBet(pool, skvett, { matchId: semi1.id, onPlayerId: blobfisk, amount: 300 }, NOW)).toMatchObject({ ok: true });
        expect(await placeBet(pool, ostebit, { matchId: semi1.id, onPlayerId: kantina, amount: 100 }, NOW)).toMatchObject({ ok: true });
        expect(await placeBet(pool, blobfisk, { matchId: semi2.id, onPlayerId: ostebit, amount: 50 }, NOW)).toMatchObject({ ok: true });
        expect(await callMatch(pool, semi1.id)).toMatchObject({ ok: true });
        expect(await reportPlayersConnected(pool, semi1.id)).toMatchObject({ ok: true, started: true });
        expect(await updateLiveScore(pool, { matchId: semi1.id, game: 1, points: [{ playerId: kantina, points: 8 }, { playerId: blobfisk, points: 11 }] }, NOW)).toEqual({ status: 'stored' });

        const logo = await checkLogo(new Uint8Array(await sharp({ create: { width: 60, height: 20, channels: 3, background: '#f6c445' } }).png().toBuffer()));
        if (!logo.ok) throw new Error(logo.error);
        const sponsor = await createSponsor(pool, eventId, { name: 'Pizzabakeren', link: null, enabled: true, gameBackground: null }, logo.value, encodeBmp32(new Uint8Array(32 * 32 * 4), 32, 32));
        if (!sponsor.ok) throw new Error(sponsor.error);
        await createSponsor(pool, eventId, { name: 'Skjult', link: null, enabled: false, gameBackground: null }, logo.value, encodeBmp32(new Uint8Array(32 * 32 * 4), 32, 32));

        const data = await getBigScreen(pool);
        expect(data).toMatchObject({ eventId, eventName: 'JulaLAN' });
        expect(data.featured).toMatchObject({ matchId: semi1.id, state: 'started', label: 'Semifinala, kamp 1', tournamentName: 'Hovedcupen', live: { game: 1, points: [11, 8] }, pool: 400, open: false });
        expect(data.featured!.sides.map((s) => [s.nickname, s.stake, s.elo])).toEqual([
            ['Blobfisk', 300, 1000],
            ['Kantina', 100, 1000],
        ]);
        expect(data.others.map((m) => [m.matchId, m.open, m.pool])).toEqual([[semi2.id, true, 50]]);
        expect(data.bracket).toMatchObject({ tournamentId, name: 'Hovedcupen', rows: 2 });
        expect(data.bracket!.rounds.map((r) => r.name)).toEqual(['Semifinala', 'Finale']);
        expect(data.boards.map((b) => b.key)).toEqual(['rette', 'sigra', 'elo']);
        expect(data.sponsors.map((s) => s.name)).toEqual(['Pizzabakeren']);
        expect(data.sponsors[0].src).toBe(`/api/sponsors/${sponsor.id}/logo?v=${createHash('sha256').update(logo.value.bytes).digest('hex')}`);
        // Nothing but nicknames and numbers leaves the store.
        expect(JSON.stringify(data)).not.toMatch(/OSTAPOPP|join_?code|pin/i);
    });

    it('counts finished matches and settled bets on the boards, and follows a wanted tournament', async () => {
        const { eventId, ids, semi1 } = await setup();
        const [blobfisk, skvett, , kantina] = ids;
        expect(await placeBet(pool, skvett, { matchId: semi1.id, onPlayerId: blobfisk, amount: 100 }, NOW)).toMatchObject({ ok: true });
        expect(await callMatch(pool, semi1.id)).toMatchObject({ ok: true });
        expect(await reportPlayersConnected(pool, semi1.id)).toMatchObject({ ok: true });
        expect(await enterGameResult(pool, semi1.id, { game: 1, winnerSlot: 1, points1: 15, points2: 4 })).toMatchObject({ ok: true });

        const other = generateBracket({ format: 'single_elimination', players: [blobfisk, kantina], seeding: { method: 'manual', order: [blobfisk, kantina] }, thirdPlaceMatch: false });
        const saved = await saveTournament(pool, eventId, { name: 'Bonuscup', seeding: 'manual', randomSeed: null, bracket: other });
        if (!saved.ok) throw new Error(saved.error);

        const data = await getBigScreen(pool);
        const [rette, sigra, elo] = data.boards;
        expect(rette.rows).toEqual([{ rank: 1, nickname: 'Skvett', value: '1 av 1' }]);
        expect(sigra.rows[0]).toEqual({ rank: 1, nickname: 'Blobfisk', value: '1 siger' });
        expect(elo.rows[0]).toEqual({ rank: 1, nickname: 'Blobfisk', value: '1016' });
        // The newest tournament with a match left is shown by default.
        expect(data.bracket?.name).toBe('Bonuscup');
        expect((await getBigScreen(pool, (await listMatches(pool, eventId))[0].tournamentId)).bracket?.name).toBe('Hovedcupen');
        expect((await getBigScreen(pool, 99_999)).bracket?.name).toBe('Bonuscup');
    });
});
