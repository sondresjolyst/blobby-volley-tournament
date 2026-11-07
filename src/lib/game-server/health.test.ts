import { describe, expect, it } from 'vitest';
import { healthLine, HEALTHY_MS } from './health';

const age = (ageSeconds: number | null) => healthLine({ kind: 'age', ageSeconds });

describe('healthLine', () => {
    it('is green under a minute and red from a minute', () => {
        expect(age(0)).toEqual({ text: 'Last report: 0 s ago', ok: true });
        expect(age(HEALTHY_MS / 1000 - 1)).toEqual({ text: 'Last report: 59 s ago', ok: true });
        expect(age(HEALTHY_MS / 1000)).toEqual({ text: 'Last report: 60 s ago', ok: false });
    });

    it('says never and is red without a report', () => {
        expect(age(null)).toEqual({ text: 'Last report: never', ok: false });
    });

    it('says the check failed, and asks for a new sign-in when the session is gone', () => {
        expect(healthLine({ kind: 'failed' })).toEqual({ text: 'Health check failed. Trying again.', ok: false });
        expect(healthLine({ kind: 'signed-out' })).toEqual({ text: 'Health check failed. Sign in again.', ok: false });
    });
});
