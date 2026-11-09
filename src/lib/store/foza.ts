// The Foza ledger. Every change to a balance is a row in foza_ledger, and a trigger adds it to the
// balance on the player row. Nothing else may change foza_balance.
import type { Pool, PoolClient } from 'pg';
import { MAX_FOZA } from '@/lib/foza';
import { inTransaction } from './transaction';

export const LEDGER_TYPES = ['starting', 'daily', 'bet', 'payout', 'refund', 'reversal', 'admin_adjustment'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export interface LedgerEntry {
    playerId: number;
    type: LedgerType;
    /** Positive adds Foza, negative takes it away. */
    amount: number;
    betId?: number;
    matchId?: number;
    reason?: string;
    adminId?: string;
}

/**
 * Writes ledger rows in the open transaction. They are written in player order, so two
 * transactions that change the same players lock them in the same order and cannot wait on each other.
 */
export async function addLedger(client: PoolClient, entries: readonly LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const sorted = [...entries].sort((a, b) => a.playerId - b.playerId);
    await client.query(
        `INSERT INTO foza_ledger (player_id, type, amount, bet_id, match_id, reason, admin_id)
         SELECT player_id, type, amount, bet_id, match_id, reason, admin_id
         FROM unnest($1::int[], $2::text[], $3::int[], $4::int[], $5::int[], $6::text[], $7::text[]) WITH ORDINALITY
             AS e (player_id, type, amount, bet_id, match_id, reason, admin_id, n)
         ORDER BY n`,
        [
            sorted.map((e) => e.playerId),
            sorted.map((e) => e.type),
            sorted.map((e) => e.amount),
            sorted.map((e) => e.betId ?? null),
            sorted.map((e) => e.matchId ?? null),
            sorted.map((e) => e.reason ?? null),
            sorted.map((e) => e.adminId ?? null),
        ],
    );
}

/**
 * Pays the daily Foza of the active event for today in Europe/Oslo time, unless the player has it
 * already. The day the player signed up is covered by the starting Foza. The unique day per player
 * in the ledger makes sure it is never paid twice, even when two requests run at once.
 */
export async function creditDaily(client: PoolClient, playerId: number, now: Date): Promise<void> {
    await client.query(
        `INSERT INTO foza_ledger (player_id, type, amount, day, created_at)
         SELECT p.id, 'daily', e.daily_foza, d.day, $2
         FROM players p
         JOIN events e ON e.id = p.event_id AND e.is_active
         CROSS JOIN LATERAL (SELECT ($2::timestamptz AT TIME ZONE 'Europe/Oslo')::date AS day) d
         WHERE p.id = $1 AND e.daily_foza > 0 AND d.day > (p.created_at AT TIME ZONE 'Europe/Oslo')::date
         ON CONFLICT (player_id, day) DO NOTHING`,
        [playerId, now],
    );
}

export interface Wallet {
    balance: number;
    /** The daily Foza paid for today in Europe/Oslo time, or null when none was paid today. */
    dailyToday: number | null;
}

/**
 * The balance of a player after the daily Foza for today is paid, and the daily Foza of today.
 * Null when there is no such player.
 */
export async function getWallet(pool: Pool, playerId: number, now: Date): Promise<Wallet | null> {
    return inTransaction(pool, async (client) => {
        await creditDaily(client, playerId, now);
        const { rows } = await client.query<{ foza_balance: number; daily: number | null }>(
            `SELECT p.foza_balance, l.amount AS daily
             FROM players p
             LEFT JOIN foza_ledger l ON l.player_id = p.id AND l.type = 'daily' AND l.day = ($2::timestamptz AT TIME ZONE 'Europe/Oslo')::date
             WHERE p.id = $1`,
            [playerId, now],
        );
        const row = rows[0];
        return row ? { balance: row.foza_balance, dailyToday: row.daily } : null;
    });
}

/** The balance of a player after the daily Foza for today is paid. Null when there is no such player. */
export async function getBalance(pool: Pool, playerId: number, now: Date): Promise<number | null> {
    return (await getWallet(pool, playerId, now))?.balance ?? null;
}

export type AdjustResult = { ok: true; eventId: number; balance: number } | { ok: false; error: 'not-found' | 'amount' | 'reason' | 'balance' };

/** Adds or takes Foza from a player by hand, with a reason. The balance cannot go below 0. */
export async function adjustBalance(pool: Pool, playerId: number, amount: number, reason: string, adminId: string | null): Promise<AdjustResult> {
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_FOZA) return { ok: false, error: 'amount' };
    const why = reason.trim();
    if (why.length < 1 || why.length > 200) return { ok: false, error: 'reason' };
    return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ event_id: number; foza_balance: number }>('SELECT event_id, foza_balance FROM players WHERE id = $1 FOR UPDATE', [playerId]);
        const player = rows[0];
        if (!player) return { ok: false as const, error: 'not-found' as const };
        if (amount < 0 && player.foza_balance + amount < 0) return { ok: false as const, error: 'balance' as const };
        await addLedger(client, [{ playerId, type: 'admin_adjustment', amount, reason: why, adminId: adminId ?? undefined }]);
        return { ok: true as const, eventId: player.event_id, balance: player.foza_balance + amount };
    });
}

export interface LedgerRow {
    id: number;
    type: LedgerType;
    amount: number;
    betId: number | null;
    matchId: number | null;
    day: string | null;
    reason: string | null;
    createdAt: Date;
}

/** Every Foza change of a player, oldest first. */
export async function listLedger(pool: Pool, playerId: number): Promise<LedgerRow[]> {
    const { rows } = await pool.query<{ id: string; type: LedgerType; amount: number; bet_id: number | null; match_id: number | null; day: string | null; reason: string | null; created_at: Date }>(
        `SELECT id, type, amount, bet_id, match_id, to_char(day, 'YYYY-MM-DD') AS day, reason, created_at FROM foza_ledger WHERE player_id = $1 ORDER BY id`,
        [playerId],
    );
    return rows.map((r) => ({ id: Number(r.id), type: r.type, amount: r.amount, betId: r.bet_id, matchId: r.match_id, day: r.day, reason: r.reason, createdAt: r.created_at }));
}

export interface FozaSummary {
    playerId: number;
    nickname: string;
    balance: number;
    starting: number;
    daily: number;
    /** The sum of admin adjustments. Can be negative. */
    adjustments: number;
    /** Foza given rather than won: starting, daily and admin adjustments. */
    earned: number;
    /** The profit from won bets: payouts minus their stakes. */
    won: number;
    /** The stakes of lost bets. */
    lost: number;
    /** Stakes on matches that have no result yet. */
    openStake: number;
    betsWon: number;
    betsLost: number;
}

interface SummaryRecord {
    player_id: number;
    nickname: string;
    balance: number;
    starting: string;
    daily: string;
    adjustments: string;
    won: string;
    lost: string;
    open_stake: string;
    bets_won: number;
    bets_lost: number;
}

const SUMMARY_SELECT = `SELECT p.id AS player_id, p.nickname, p.foza_balance AS balance,
    coalesce((SELECT sum(amount) FROM foza_ledger l WHERE l.player_id = p.id AND l.type = 'starting'), 0) AS starting,
    coalesce((SELECT sum(amount) FROM foza_ledger l WHERE l.player_id = p.id AND l.type = 'daily'), 0) AS daily,
    coalesce((SELECT sum(amount) FROM foza_ledger l WHERE l.player_id = p.id AND l.type = 'admin_adjustment'), 0) AS adjustments,
    coalesce((SELECT sum(payout - amount) FROM bets b WHERE b.player_id = p.id AND b.status = 'won'), 0) AS won,
    coalesce((SELECT sum(amount) FROM bets b WHERE b.player_id = p.id AND b.status = 'lost'), 0) AS lost,
    coalesce((SELECT sum(amount) FROM bets b WHERE b.player_id = p.id AND b.status = 'open'), 0) AS open_stake,
    (SELECT count(*)::int FROM bets b WHERE b.player_id = p.id AND b.status = 'won') AS bets_won,
    (SELECT count(*)::int FROM bets b WHERE b.player_id = p.id AND b.status = 'lost') AS bets_lost
    FROM players p`;

function toSummary(r: SummaryRecord): FozaSummary {
    const starting = Number(r.starting);
    const daily = Number(r.daily);
    const adjustments = Number(r.adjustments);
    return {
        playerId: r.player_id,
        nickname: r.nickname,
        balance: r.balance,
        starting,
        daily,
        adjustments,
        earned: starting + daily + adjustments,
        won: Number(r.won),
        lost: Number(r.lost),
        openStake: Number(r.open_stake),
        betsWon: r.bets_won,
        betsLost: r.bets_lost,
    };
}

/** Foza earned, won and lost for one player. Null when there is no such player. */
export async function getFozaSummary(pool: Pool, playerId: number): Promise<FozaSummary | null> {
    const { rows } = await pool.query<SummaryRecord>(`${SUMMARY_SELECT} WHERE p.id = $1`, [playerId]);
    return rows[0] ? toSummary(rows[0]) : null;
}

/** Foza earned, won and lost for every player of an event, by nickname. */
export async function listFozaSummaries(pool: Pool, eventId: number): Promise<FozaSummary[]> {
    const { rows } = await pool.query<SummaryRecord>(`${SUMMARY_SELECT} WHERE p.event_id = $1 ORDER BY p.nickname_key`, [eventId]);
    return rows.map(toSummary);
}
