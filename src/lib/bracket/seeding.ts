export type SeedingMethod = 'random' | 'manual' | 'elo';

export const SEEDING_METHODS: readonly SeedingMethod[] = ['random', 'manual', 'elo'];

/** The rating of a player who has none yet. */
export const DEFAULT_ELO = 1000;

/** The largest random seed. It fits in a Postgres integer. */
export const MAX_RANDOM_SEED = 2_147_483_647;

export type Seeding =
    | { method: 'random'; seed: number }
    /** Player ids in seed order, seed 1 first. It must hold the same players. */
    | { method: 'manual'; order: readonly number[] }
    /** Ratings by player id. A player without one counts as DEFAULT_ELO. */
    | { method: 'elo'; ratings: ReadonlyMap<number, number> };

/** A small seeded random number generator (mulberry32). It gives numbers from 0 up to but not including 1. */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
}

/**
 * Puts the players in seed order, seed 1 first. Random seeding sorts the ids first, so the same
 * players and the same seed always give the same order. Elo puts the highest rating first, and
 * equal ratings go by player id, the lowest first.
 */
export function seedPlayers(players: readonly number[], seeding: Seeding): number[] {
    if (new Set(players).size !== players.length) throw new Error('A player can only be seeded once.');
    switch (seeding.method) {
        case 'random': {
            if (!Number.isSafeInteger(seeding.seed) || seeding.seed < 0 || seeding.seed > MAX_RANDOM_SEED) throw new Error('The random seed is out of range.');
            const order = [...players].sort((a, b) => a - b);
            const random = seededRandom(seeding.seed);
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }
            return order;
        }
        case 'manual': {
            const given = new Set(seeding.order);
            if (given.size !== seeding.order.length || given.size !== players.length || !players.every((id) => given.has(id))) {
                throw new Error('The hand seeding must list each player once.');
            }
            return [...seeding.order];
        }
        case 'elo': {
            const rating = (id: number) => seeding.ratings.get(id) ?? DEFAULT_ELO;
            return [...players].sort((a, b) => rating(b) - rating(a) || a - b);
        }
    }
}
