// Counts requests per client bucket in fixed windows, in this process only. The counts start over
// with each window, so the map never holds more buckets than one window saw.

export class RateWindow {
    private readonly counts = new Map<string, number>();
    private start = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly limit: number,
        private readonly windowMs: number,
        private readonly now: () => number = Date.now,
    ) {}

    /** Counts one request of the bucket. False when the bucket is over the limit in this window. */
    take(bucket: string): boolean {
        const time = this.now();
        if (time - this.start >= this.windowMs) {
            this.counts.clear();
            this.start = time;
        }
        const count = (this.counts.get(bucket) ?? 0) + 1;
        this.counts.set(bucket, count);
        return count <= this.limit;
    }
}
