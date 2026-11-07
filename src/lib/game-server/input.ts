// Reads the JSON bodies the game server sends. Each parser names the first bad field.
import { readCappedBody } from '@/lib/http';
import { isPoints } from '@/lib/matches/settings';

/** The largest body read. Every request of the game server is far smaller. */
export const MAX_BODY_BYTES = 16 * 1024;

const MAX_ID = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// An ISO 8601 time with a date, a time and a zone, such as 2026-11-20T18:04:05Z.
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

/** Reads a JSON body of at most MAX_BODY_BYTES. Returns undefined when it is too large, not UTF-8 or not JSON. */
export async function readJsonBody(req: Request): Promise<unknown> {
    const length = Number(req.headers.get('content-length') ?? '0');
    if (!(length <= MAX_BODY_BYTES)) return undefined;
    const bytes = await readCappedBody(req, MAX_BODY_BYTES);
    if (!bytes) return undefined;
    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return undefined;
    }
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_ID;

function readTime(value: unknown): Date | null {
    if (typeof value !== 'string' || !TIME.test(value)) return null;
    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? null : time;
}

export interface PlayerPoints {
    playerId: number;
    points: number;
}

/** Two entries for two different players. */
function readPoints(value: unknown): PlayerPoints[] | null {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const points: PlayerPoints[] = [];
    for (const entry of value) {
        if (!isObject(entry) || !isId(entry.playerId) || !isPoints(entry.points)) return null;
        points.push({ playerId: entry.playerId, points: entry.points });
    }
    return points[0].playerId === points[1].playerId ? null : points;
}

/** Body of POST /api/server/matches/{id}/connected: `{ "playerIds": [12, 17] }`. */
export function parseConnected(body: unknown): Parsed<{ playerIds: [number, number] }> {
    if (!isObject(body)) return { ok: false, field: 'body' };
    const ids = body.playerIds;
    if (!Array.isArray(ids) || ids.length !== 2 || !ids.every(isId) || ids[0] === ids[1]) return { ok: false, field: 'playerIds' };
    return { ok: true, value: { playerIds: [ids[0], ids[1]] } };
}

export interface GameReportInput {
    reportId: string;
    matchId: number;
    game: number;
    status: 'finished' | 'abandoned';
    winnerId: number | null;
    /** The player who left an abandoned game, when the server knows. Always null for a finished game. */
    leftPlayerId: number | null;
    points: PlayerPoints[];
    startedAt: Date;
    endedAt: Date;
}

/**
 * Body of POST /api/server/games. A finished game names a winner with more points. An abandoned
 * game has none, and may name the player who left. A finished game that names one is refused.
 */
export function parseGameReport(body: unknown): Parsed<GameReportInput> {
    if (!isObject(body)) return { ok: false, field: 'body' };
    if (typeof body.reportId !== 'string' || !UUID.test(body.reportId)) return { ok: false, field: 'reportId' };
    if (!isId(body.matchId)) return { ok: false, field: 'matchId' };
    if (!isId(body.game)) return { ok: false, field: 'game' };
    const status = body.status;
    if (status !== 'finished' && status !== 'abandoned') return { ok: false, field: 'status' };
    const points = readPoints(body.points);
    if (!points) return { ok: false, field: 'points' };
    let winnerId: number | null = null;
    let leftPlayerId: number | null = null;
    if (status === 'finished') {
        if (body.leftPlayerId !== undefined && body.leftPlayerId !== null) return { ok: false, field: 'leftPlayerId' };
        if (!isId(body.winnerId)) return { ok: false, field: 'winnerId' };
        const winner = points.find((p) => p.playerId === body.winnerId);
        const loser = points.find((p) => p.playerId !== body.winnerId);
        if (!winner || !loser) return { ok: false, field: 'winnerId' };
        if (winner.points <= loser.points) return { ok: false, field: 'points' };
        winnerId = winner.playerId;
    } else {
        if (body.winnerId !== undefined && body.winnerId !== null) return { ok: false, field: 'winnerId' };
        if (body.leftPlayerId !== undefined && body.leftPlayerId !== null) {
            if (!isId(body.leftPlayerId)) return { ok: false, field: 'leftPlayerId' };
            leftPlayerId = body.leftPlayerId;
        }
    }
    const startedAt = readTime(body.startedAt);
    if (!startedAt) return { ok: false, field: 'startedAt' };
    const endedAt = readTime(body.endedAt);
    if (!endedAt || endedAt < startedAt) return { ok: false, field: 'endedAt' };
    // Lower case, so the same UUID in another case is still the same report.
    return { ok: true, value: { reportId: body.reportId.toLowerCase(), matchId: body.matchId, game: body.game, status, winnerId, leftPlayerId, points, startedAt, endedAt } };
}

export interface LiveInputBody {
    matchId: number;
    game: number;
    points: PlayerPoints[];
}

/** Body of POST /api/server/live. */
export function parseLive(body: unknown): Parsed<LiveInputBody> {
    if (!isObject(body)) return { ok: false, field: 'body' };
    if (!isId(body.matchId)) return { ok: false, field: 'matchId' };
    if (!isId(body.game)) return { ok: false, field: 'game' };
    const points = readPoints(body.points);
    if (!points) return { ok: false, field: 'points' };
    return { ok: true, value: { matchId: body.matchId, game: body.game, points } };
}

/** The 400 answer for a body that could not be read. */
export const badRequest = (field: string) => Response.json({ error: 'invalid', field }, { status: 400 });
