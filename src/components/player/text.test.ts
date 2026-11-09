import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '@/lib/store/matches';
import { matchPlayers, matchTitle } from '../matches/describe';
import { challengeErrorMessage, dailyFozaLine, foza, matchSettings, noticeMessage, payout, pointsHint, roundSettings } from './text';

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
        expect(matchSettings(oneVsOne)).toBe('Best av 3 · Vanlig · først te 21 · 90 fps');
    });

    it('names the rules and the points they really play to', () => {
        expect(matchSettings({ ...oneVsOne, ruleFile: 'tennis.lua' })).toBe('Best av 3 · Tennis · først te 21 · 90 fps');
        expect(matchSettings({ ...oneVsOne, ruleFile: 'blitz.lua' })).toBe('Best av 3 · Lyn · først te 2 · 90 fps');
        expect(matchSettings({ ...oneVsOne, ruleFile: 'firewall.lua', scoreToWin: 15 })).toBe('Best av 3 · Brannmur · først te 150 · 90 fps');
        expect(matchSettings({ ...oneVsOne, ruleFile: 'old.lua' })).toBe('Best av 3 · old.lua · først te 21 · 90 fps');
    });

    it('names the rules of a bracket round, with the points when the rules change them', () => {
        expect(roundSettings({ bestOf: 3, ruleFile: 'default.lua' }, 15)).toBe('Best av 3 · Vanlig');
        expect(roundSettings({ bestOf: 5, ruleFile: 'one_hit_wonder.lua' }, 15)).toBe('Best av 5 · Eitt slag');
        expect(roundSettings({ bestOf: 1, ruleFile: 'blitz.lua' }, 15)).toBe('Best av 1 · Lyn · først te 2');
        expect(roundSettings({ bestOf: 1, ruleFile: 'firewall.lua' }, 7)).toBe('Best av 1 · Brannmur · først te 70');
        expect(roundSettings({ bestOf: 1, ruleFile: 'bronze.lua' }, 15)).toBe('Best av 1 · bronze.lua');
    });

    it('tells the real points under the points field of the 1v1 form', () => {
        expect(pointsHint('default.lua', 15)).toBe('poeng i kvart sett, 1 te 99, vanleg e 15');
        expect(pointsHint('tennis.lua', 9)).toBe('poeng i kvart sett, 1 te 99, vanleg e 15');
        expect(pointsHint('blitz.lua', 15)).toBe('Lyn spele alltid te 2');
        expect(pointsHint('firewall.lua', 15)).toBe('Brannmur gonge med 10, så dåkke spele te 150. Høgst 90');
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
