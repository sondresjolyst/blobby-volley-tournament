import { describe, expect, it } from 'vitest';
import { healthLine, HEALTHY_MS, reportAge } from './health';

const now = new Date('2026-11-20T18:00:00Z');

describe('reportAge', () => {
    it('is the whole seconds since the last report', () => {
        expect(reportAge(new Date(now.getTime() - 12_900), now)).toBe(12);
        expect(reportAge(now, now)).toBe(0);
    });

    it('is null without a report and never below zero', () => {
        expect(reportAge(null, now)).toBeNull();
        expect(reportAge(new Date(now.getTime() + 5000), now)).toBe(0);
    });
});

describe('healthLine', () => {
    it('is green under a minute and red from a minute', () => {
        expect(healthLine(0)).toEqual({ text: 'Last report 0 s ago', ok: true });
        expect(healthLine(HEALTHY_MS / 1000 - 1)).toEqual({ text: 'Last report 59 s ago', ok: true });
        expect(healthLine(HEALTHY_MS / 1000)).toEqual({ text: 'Last report 60 s ago', ok: false });
    });

    it('says never and is red without a report', () => {
        expect(healthLine(null)).toEqual({ text: 'Last report: never', ok: false });
    });
});
