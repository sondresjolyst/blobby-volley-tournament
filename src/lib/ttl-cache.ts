// A small in-process cache with a time to live. Callers that ask for the same key at the same time
// share one load, so many readers cause one piece of work.

export class TtlCache<T> {
    private readonly entries = new Map<string, { at: number; value: Promise<T> }>();

    constructor(
        private readonly ttlMs: number,
        private readonly now: () => number = Date.now,
    ) {}

    /** The value for the key, loaded again once it is older than the time to live. A failed load is not kept. */
    get(key: string, load: () => Promise<T>): Promise<T> {
        const time = this.now();
        const hit = this.entries.get(key);
        if (hit && time - hit.at < this.ttlMs) return hit.value;
        // Old entries of other keys go too, so the map stays as small as the keys in use.
        for (const [k, entry] of this.entries) if (time - entry.at >= this.ttlMs) this.entries.delete(k);
        const value = load();
        const entry = { at: time, value };
        this.entries.set(key, entry);
        value.catch(() => {
            if (this.entries.get(key) === entry) this.entries.delete(key);
        });
        return value;
    }
}
