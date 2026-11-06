import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { generateBracket } from '@/lib/bracket';
import { saveTournament } from './tournaments';

const bracket = generateBracket({ format: 'single_elimination', players: [1, 2], seeding: { method: 'random', seed: 1 } });

describe('saveTournament without a database', () => {
    it('keeps the first error and drops the connection when ROLLBACK fails', async () => {
        const broken = new Error('connection lost');
        const release = vi.fn();
        const query = vi.fn(async (sql: string) => {
            if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
            if (sql === 'ROLLBACK') throw new Error('rollback failed');
            throw broken;
        });
        const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
        await expect(saveTournament(pool, 1, { name: 'Cup', seeding: 'random', randomSeed: 1, bracket })).rejects.toBe(broken);
        expect(release).toHaveBeenCalledTimes(1);
        expect(release.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('releases the connection normally after a rollback that works', async () => {
        const release = vi.fn();
        const query = vi.fn(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
            throw new Error('insert failed');
        });
        const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
        await expect(saveTournament(pool, 1, { name: 'Cup', seeding: 'random', randomSeed: 1, bracket })).rejects.toThrow('insert failed');
        expect(release).toHaveBeenCalledTimes(1);
        expect(release.mock.calls[0]).toEqual([]);
    });

    it('refuses seeds that do not fit the players before it touches the database', async () => {
        const connect = vi.fn();
        const pool = { connect } as unknown as Pool;
        const save = (seeds: number[]) => saveTournament(pool, 1, { name: 'Cup', seeding: 'random', randomSeed: 1, bracket: { ...bracket, seeds } });
        expect(await save([1, 1])).toEqual({ ok: false, error: 'players' });
        expect(await save([1])).toEqual({ ok: false, error: 'players' });
        expect(await save(Array.from({ length: 33 }, (_, i) => i + 1))).toEqual({ ok: false, error: 'players' });
        // A player in a match who is not seeded.
        expect(await save([1, 3])).toEqual({ ok: false, error: 'players' });
        expect(connect).not.toHaveBeenCalled();
    });
});
