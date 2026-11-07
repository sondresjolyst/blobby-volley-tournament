import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, parseConnected, parseGameReport, parseLive, readJsonBody } from './input';

const REPORT_ID = '0b6f2f4e-8a51-4d4c-9a0e-5d2b8c3f1a77';

const report = (change: Record<string, unknown> = {}) => ({
    reportId: REPORT_ID,
    matchId: 7,
    game: 1,
    status: 'finished',
    winnerId: 12,
    points: [
        { playerId: 12, points: 15 },
        { playerId: 17, points: 9 },
    ],
    startedAt: '2026-11-20T18:00:00Z',
    endedAt: '2026-11-20T18:04:30.250Z',
    ...change,
});

describe('readJsonBody', () => {
    const post = (body: string, headers: Record<string, string> = {}) => new Request('https://bvt.example.test/api/server/games', { method: 'POST', body, headers });

    it('reads JSON', async () => {
        expect(await readJsonBody(post('{"a":1}'))).toEqual({ a: 1 });
    });

    it('gives undefined for text that is not JSON, and for a body that is too large', async () => {
        expect(await readJsonBody(post('{a:1'))).toBeUndefined();
        expect(await readJsonBody(post(''))).toBeUndefined();
        expect(await readJsonBody(post(JSON.stringify({ a: 'x'.repeat(MAX_BODY_BYTES) })))).toBeUndefined();
        expect(await readJsonBody(post('{}', { 'content-length': String(MAX_BODY_BYTES + 1) }))).toBeUndefined();
    });

    it('stops reading a streamed body with no content-length once it passes the limit', async () => {
        const chunk = new TextEncoder().encode('x'.repeat(1024));
        let pulled = 0;
        let cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulled++;
                // Never ends by itself, so a reader that buffers the whole body would hang.
                controller.enqueue(pulled === 1 ? new TextEncoder().encode('{"a":"') : chunk);
            },
            cancel() {
                cancelled = true;
            },
        });
        const req = new Request('https://bvt.example.test/api/server/games', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
        expect(req.headers.get('content-length')).toBeNull();
        expect(await readJsonBody(req)).toBeUndefined();
        expect(cancelled).toBe(true);
        expect(pulled).toBeLessThanOrEqual(MAX_BODY_BYTES / chunk.byteLength + 3);
    });

    it('reads a streamed body under the limit and refuses bytes that are not UTF-8', async () => {
        const streamOf = (...parts: Uint8Array[]) =>
            new Request('https://bvt.example.test/api/server/games', {
                method: 'POST',
                body: new ReadableStream<Uint8Array>({
                    start(controller) {
                        for (const part of parts) controller.enqueue(part);
                        controller.close();
                    },
                }),
                duplex: 'half',
            } as RequestInit);
        const enc = new TextEncoder();
        expect(await readJsonBody(streamOf(enc.encode('{"a":'), enc.encode('"æ"}')))).toEqual({ a: 'æ' });
        expect(await readJsonBody(streamOf(enc.encode('{"a":"'), new Uint8Array([0xff]), enc.encode('"}')))).toBeUndefined();
    });
});

describe('parseConnected', () => {
    it('reads two different player ids', () => {
        expect(parseConnected({ playerIds: [12, 17] })).toEqual({ ok: true, value: { playerIds: [12, 17] } });
    });

    it.each([
        ['body', null],
        ['body', [12, 17]],
        ['playerIds', {}],
        ['playerIds', { playerIds: [12] }],
        ['playerIds', { playerIds: [12, 12] }],
        ['playerIds', { playerIds: [12, 17, 3] }],
        ['playerIds', { playerIds: [12, '17'] }],
        ['playerIds', { playerIds: [0, 17] }],
        ['playerIds', { playerIds: [12, 1.5] }],
        ['playerIds', { playerIds: [12, 2_147_483_648] }],
    ])('names %s for %j', (field, body) => {
        expect(parseConnected(body)).toEqual({ ok: false, field });
    });
});

describe('parseGameReport', () => {
    it('reads a finished game and puts the report id in lower case', () => {
        expect(parseGameReport(report({ reportId: REPORT_ID.toUpperCase() }))).toEqual({
            ok: true,
            value: {
                reportId: REPORT_ID,
                matchId: 7,
                game: 1,
                status: 'finished',
                winnerId: 12,
                leftPlayerId: null,
                points: [
                    { playerId: 12, points: 15 },
                    { playerId: 17, points: 9 },
                ],
                startedAt: new Date('2026-11-20T18:00:00Z'),
                endedAt: new Date('2026-11-20T18:04:30.250Z'),
            },
        });
    });

    it('reads an abandoned game with no winner, with or without the winnerId field', () => {
        expect(parseGameReport(report({ status: 'abandoned', winnerId: null }))).toMatchObject({ ok: true, value: { status: 'abandoned', winnerId: null } });
        const tied = report({
            status: 'abandoned',
            points: [
                { playerId: 12, points: 3 },
                { playerId: 17, points: 3 },
            ],
        }) as Record<string, unknown>;
        delete tied.winnerId;
        expect(parseGameReport(tied)).toMatchObject({ ok: true, value: { status: 'abandoned', winnerId: null } });
    });

    it('reads the player who left an abandoned game, and null when it is left out', () => {
        expect(parseGameReport(report({ status: 'abandoned', winnerId: null, leftPlayerId: 12 }))).toMatchObject({ ok: true, value: { status: 'abandoned', leftPlayerId: 12 } });
        expect(parseGameReport(report({ status: 'abandoned', winnerId: null, leftPlayerId: null }))).toMatchObject({ ok: true, value: { leftPlayerId: null } });
        expect(parseGameReport(report({ status: 'abandoned', winnerId: null }))).toMatchObject({ ok: true, value: { leftPlayerId: null } });
        expect(parseGameReport(report())).toMatchObject({ ok: true, value: { status: 'finished', leftPlayerId: null } });
        expect(parseGameReport(report({ leftPlayerId: null }))).toMatchObject({ ok: true, value: { leftPlayerId: null } });
    });

    it('reads a time zone offset', () => {
        expect(parseGameReport(report({ startedAt: '2026-11-20T19:00:00+01:00' }))).toMatchObject({ ok: true, value: { startedAt: new Date('2026-11-20T18:00:00Z') } });
    });

    const pts = (a: unknown, b: unknown, idB = 17) => [
        { playerId: 12, points: a },
        { playerId: idB, points: b },
    ];

    it.each([
        ['reportId', { reportId: undefined }],
        ['reportId', { reportId: 'r-1' }],
        ['reportId', { reportId: `${REPORT_ID}0` }],
        ['matchId', { matchId: '7' }],
        ['matchId', { matchId: 0 }],
        ['game', { game: 0 }],
        ['game', { game: 1.5 }],
        ['status', { status: 'won' }],
        ['status', { status: undefined }],
        ['points', { points: [{ playerId: 12, points: 15 }] }],
        ['points', { points: pts(15, 9, 12) }],
        ['points', { points: pts(15, -1) }],
        ['points', { points: pts(1001, 9) }],
        ['points', { points: pts('15', 9) }],
        ['points', { points: { 12: 15, 17: 9 } }],
        ['winnerId', { winnerId: null }],
        ['winnerId', { winnerId: 99 }],
        ['points', { winnerId: 17 }],
        ['points', { points: pts(9, 9) }],
        ['winnerId', { status: 'abandoned', winnerId: 12 }],
        ['leftPlayerId', { leftPlayerId: 12 }],
        ['leftPlayerId', { status: 'abandoned', winnerId: null, leftPlayerId: '12' }],
        ['leftPlayerId', { status: 'abandoned', winnerId: null, leftPlayerId: 0 }],
        ['leftPlayerId', { status: 'abandoned', winnerId: null, leftPlayerId: 1.5 }],
        ['startedAt', { startedAt: undefined }],
        ['startedAt', { startedAt: '2026-11-20 18:00:00' }],
        ['startedAt', { startedAt: '2026-11-20T18:00:00' }],
        ['startedAt', { startedAt: '2026-13-40T18:00:00Z' }],
        ['startedAt', { startedAt: 1763661600000 }],
        ['endedAt', { endedAt: 'soon' }],
        ['endedAt', { endedAt: '2026-11-20T17:59:59Z' }],
    ])('names %s for a bad report %j', (field, change) => {
        expect(parseGameReport(report(change))).toEqual({ ok: false, field });
    });

    it('names the body when it is not an object', () => {
        for (const body of [undefined, null, 'x', [report()]]) expect(parseGameReport(body)).toEqual({ ok: false, field: 'body' });
    });
});

describe('parseLive', () => {
    const live = (change: Record<string, unknown> = {}) => ({
        matchId: 7,
        game: 2,
        points: [
            { playerId: 17, points: 4 },
            { playerId: 12, points: 0 },
        ],
        ...change,
    });

    it('reads the score', () => {
        expect(parseLive(live())).toEqual({ ok: true, value: live() });
    });

    it.each([
        ['matchId', { matchId: -1 }],
        ['game', { game: '2' }],
        ['points', { points: [] }],
        [
            'points',
            {
                points: [
                    { playerId: 17, points: 4 },
                    { playerId: 17, points: 0 },
                ],
            },
        ],
    ])('names %s for %j', (field, change) => {
        expect(parseLive(live(change))).toEqual({ ok: false, field });
    });

    it('names the body when it is not an object', () => {
        expect(parseLive(null)).toEqual({ ok: false, field: 'body' });
    });
});
