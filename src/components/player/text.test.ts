import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '@/lib/store/matches';
import { challengeErrorMessage, foza, matchPlayers, matchSettings, matchTitle, noticeMessage, payout } from './text';

const oneVsOne: MatchSummary = {
    id: 9,
    eventId: 1,
    tournamentId: null,
    tournamentName: null,
    bracketMatchId: null,
    roundLabel: null,
    bracketRound: null,
    state: 'upcoming',
    bestOf: 3,
    ruleFile: 'default.lua',
    scoreToWin: 21,
    speed: 90,
    players: [{ id: 1, nickname: 'Ola' }, null],
    acceptedAt: null,
    score1: 0,
    score2: 0,
    winnerId: null,
    result: null,
    cancelReason: null,
};

describe('player texts', () => {
    it('groups Foza and writes the payout with a decimal comma', () => {
        expect(foza(1250).replace(/\s/g, ' ')).toBe('1 250 Foza');
        expect(foza(15)).toBe('15 Foza');
        expect(payout(1.6)).toBe('betale 1,60×');
        expect(payout(null)).toBe('ingen spel enno');
    });

    it('names tournament and 1v1 matches', () => {
        expect(matchTitle(oneVsOne)).toBe('1v1-utfordring');
        const semi: MatchSummary = {
            ...oneVsOne,
            tournamentId: 2,
            tournamentName: 'Hovedcupen',
            bracketMatchId: 5,
            bracketRound: { format: 'single_elimination', section: 'winners', round: 2, lastRound: 3, position: 1 },
        };
        expect(matchTitle(semi)).toBe('Hovedcupen · Semifinala, kamp 1');
        expect(matchPlayers(oneVsOne)).toBe('Ola vs Ikkje klart enno');
        expect(matchSettings(oneVsOne)).toBe('Best av 3 · først te 21 · 90 fps');
    });

    it('has a text for known codes only', () => {
        expect(challengeErrorMessage('taken')).toBe('Dåkke har allerede ein open 1v1. Spel han ferdig først.');
        expect(challengeErrorMessage('constructor')).toBeNull();
        expect(challengeErrorMessage(['taken'])).toBeNull();
        expect(noticeMessage('sent')).toBe('Utfordringå e sendt. No e det opp te motstandaren.');
        expect(noticeMessage('toString')).toBeNull();
    });
});
