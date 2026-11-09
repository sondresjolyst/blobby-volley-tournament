import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '@/lib/store/matches';
import { matchPlayers, matchTitle } from '../matches/describe';
import { challengeErrorMessage, dailyFozaLine, foza, matchSettings, noticeMessage, payout } from './text';

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
    finishedAt: null,
};

describe('player texts', () => {
    it('groups Foza and writes the payout with a decimal comma', () => {
        expect(foza(1250).replace(/\s/g, ' ')).toBe('1 250 Foza');
        expect(foza(15)).toBe('15 Foza');
        expect(payout(1.6)).toBe('betale 1,60×');
        expect(payout(null)).toBe('ingen spel ennå');
    });

    it('tells the daily Foza in one short line', () => {
        expect(dailyFozaLine(1250)).toBe('Du får 1 250 Foza kvar dag du e med.');
    });

    it('names tournament and 1v1 matches for players and admins', () => {
        expect(matchTitle(oneVsOne, 'player')).toBe('1v1');
        expect(matchTitle(oneVsOne, 'admin')).toBe('1v1');
        const semi: MatchSummary = {
            ...oneVsOne,
            tournamentId: 2,
            tournamentName: 'Hovedcupen',
            bracketMatchId: 5,
            bracketRound: { format: 'single_elimination', section: 'winners', round: 2, lastRound: 3, position: 1 },
        };
        expect(matchTitle(semi, 'player')).toBe('Hovedcupen · Semifinala, kamp 1');
        expect(matchTitle(semi, 'admin')).toBe('Hovedcupen, Round 2, match 1');
        expect(matchTitle({ ...semi, bracketRound: { ...semi.bracketRound!, round: 3 } }, 'admin')).toBe('Hovedcupen, Final, match 1');
        expect(matchPlayers(oneVsOne, 'player')).toBe('Ola vs Ikkje klart ennå');
        expect(matchPlayers(oneVsOne, 'admin')).toBe('Ola vs To be decided');
        expect(matchSettings(oneVsOne)).toBe('Best av 3 · først te 21 · 90 fps');
    });

    it('has a text for known codes only', () => {
        expect(challengeErrorMessage('taken')).toBe('Dåkke to har allerede ein 1v1 som ikkje e ferdig. Svar på utfordringå, eller spel ferdig den kampen først.');
        expect(challengeErrorMessage('constructor')).toBeNull();
        expect(challengeErrorMessage(['taken'])).toBeNull();
        expect(noticeMessage('sent')).toBe('Utfordringå e sendt. Nå e det opp te motstandaren.');
        expect(noticeMessage('accepted')).toBe('Du godtok kampen. Dåkke kan spela med ein gang.');
        expect(noticeMessage('queued')).toBe('Du godtok kampen. Dåkke kan spela så fort begge e klare.');
        expect(noticeMessage('toString')).toBeNull();
    });
});
