import { describe, expect, it } from 'vitest';
import { fieldsOf, parseTournamentDraft, planTournament, roundsMatch, roundsSignature, type TournamentDraft } from './input';
import { describeBracket } from './view';

const fields = (pairs: [string, string][]) => fieldsOf(new URLSearchParams(pairs));
const base = (format: string, players: number[], extra: [string, string][] = []): [string, string][] => [
    ['name', 'Cup'],
    ['format', format],
    ['seeding', 'random'],
    ['randomSeed', '3'],
    ...players.map((id) => ['player', String(id)] as [string, string]),
    ...extra,
];

function draftOf(players: number[], extra: [string, string][] = [], format = 'single_elimination'): TournamentDraft {
    const draft = parseTournamentDraft(fields(base(format, players, extra)));
    if (!draft.ok) throw new Error(draft.error);
    return draft.value;
}

describe('third place match in the form', () => {
    it('is off unless the box is ticked, and only counts for single elimination', () => {
        expect(draftOf([1, 2, 3, 4]).thirdPlaceMatch).toBe(false);
        expect(draftOf([1, 2, 3, 4], [['thirdPlace', '1']]).thirdPlaceMatch).toBe(true);
        expect(draftOf([1, 2, 3, 4], [['thirdPlace', '1']], 'double_elimination').thirdPlaceMatch).toBe(false);
    });

    it('needs 4 players', () => {
        expect(parseTournamentDraft(fields(base('single_elimination', [1, 2, 3], [['thirdPlace', '1']])))).toEqual({ ok: false, error: 'third-place' });
    });

    it('reaches the plan with its own round settings', () => {
        const plan = planTournament(draftOf([1, 2, 3, 4], [['thirdPlace', '1'], ['bestOf_third_place-1', '3']]));
        expect(plan.thirdPlaceMatch).toBe(true);
        expect(plan.rounds.at(-1)).toMatchObject({ key: 'third_place-1', bestOf: 3 });
    });
});

describe('roundsMatch', () => {
    it('accepts round settings from a preview of the same bracket', () => {
        const signature = roundsSignature(planTournament(draftOf([1, 2, 3, 4, 5])));
        const draft = draftOf([1, 2, 3, 4, 5], [['roundsFor', signature], ['bestOf_winners-3', '5']]);
        expect(roundsMatch(draft, planTournament(draft))).toBe(true);
    });

    it('refuses round settings when the player count changed, even with the same round keys', () => {
        const signature = roundsSignature(planTournament(draftOf([1, 2, 3, 4, 5])));
        const draft = draftOf([1, 2, 3, 4, 5, 6], [['roundsFor', signature], ['bestOf_winners-3', '5']]);
        expect(planTournament(draft).rounds.map((r) => r.key)).toEqual(['winners-1', 'winners-2', 'winners-3']);
        expect(roundsMatch(draft, planTournament(draft))).toBe(false);
    });

    it('refuses a setting for a round the bracket does not have', () => {
        const signature = roundsSignature(planTournament(draftOf([1, 2, 3, 4])));
        const draft = draftOf([1, 2, 3, 4], [['roundsFor', signature], ['bestOf_winners-3', '5']]);
        expect(roundsMatch(draft, planTournament(draft))).toBe(false);
    });

    it('refuses a save without a preview, and after a change of format or third place match', () => {
        const four = [1, 2, 3, 4];
        expect(roundsMatch(draftOf(four), planTournament(draftOf(four)))).toBe(false);
        const signature = roundsSignature(planTournament(draftOf(four)));
        const third = draftOf(four, [['roundsFor', signature], ['thirdPlace', '1']]);
        expect(roundsMatch(third, planTournament(third))).toBe(false);
        const double = draftOf(four, [['roundsFor', signature]], 'double_elimination');
        expect(roundsMatch(double, planTournament(double))).toBe(false);
    });
});

describe('describeBracket places', () => {
    it('names the places decided by each match', () => {
        const draft = draftOf([1, 2, 3, 4]);
        const shared = describeBracket('single_elimination', planTournament(draft).matches, String);
        expect(shared.flatMap((r) => r.matches.map((m) => [m.winnerTo, m.loserTo]))).toEqual([
            ['Match 3', 'Shares 3rd place'],
            ['Match 3', 'Shares 3rd place'],
            ['1st place', '2nd place'],
        ]);
        const withThird = describeBracket('single_elimination', planTournament({ ...draft, thirdPlaceMatch: true }).matches, String);
        expect(withThird.flatMap((r) => r.matches.map((m) => [m.winnerTo, m.loserTo]))).toEqual([
            ['Match 3', 'Match 4'],
            ['Match 3', 'Match 4'],
            ['1st place', '2nd place'],
            ['3rd place', '4th place'],
        ]);
    });
});
