import { describe, expect, it } from 'vitest';
import { MAX_RANDOM_SEED } from '@/lib/bracket';
import { fieldsOf, newRandomSeed, parseTournamentDraft, planTournament, toSearchParams, tournamentErrorMessage } from './input';
import { describeBracket } from './view';

const form = (extra: [string, string][] = [], base: [string, string][] = [['name', 'Cup'], ['format', 'single_elimination'], ['seeding', 'random'], ['randomSeed', '7'], ['player', '3'], ['player', '1'], ['player', '2']]) =>
    fieldsOf(new URLSearchParams([...base, ...extra]));

const without = (name: string) =>
    fieldsOf(new URLSearchParams([['name', 'Cup'], ['format', 'single_elimination'], ['seeding', 'random'], ['randomSeed', '7'], ['player', '1'], ['player', '2']].filter(([key]) => key !== name) as [string, string][]));

describe('parseTournamentDraft', () => {
    it('reads the form', () => {
        expect(parseTournamentDraft(form())).toEqual({
            ok: true,
            value: { name: 'Cup', format: 'single_elimination', seeding: 'random', randomSeed: 7, playerIds: [1, 2, 3], manualOrder: null, rounds: {} },
        });
    });

    it('reads FormData too', () => {
        const data = new FormData();
        for (const [k, v] of [['name', 'Cup'], ['format', 'double_elimination'], ['seeding', 'elo'], ['randomSeed', '0'], ['player', '5'], ['player', '4']]) data.append(k, v);
        expect(parseTournamentDraft(fieldsOf(data))).toMatchObject({ ok: true, value: { format: 'double_elimination', seeding: 'elo', playerIds: [4, 5] } });
    });

    it.each([
        ['name', 'name'],
        ['format', 'format'],
        ['seeding', 'seeding'],
        ['randomSeed', 'random-seed'],
        ['player', 'players'],
    ])('refuses a form without %s', (field, error) => {
        expect(parseTournamentDraft(without(field))).toEqual({ ok: false, error });
    });

    it('refuses bad values', () => {
        const base: [string, string][] = [['player', '1'], ['player', '2']];
        const check = (fields: [string, string][]) => parseTournamentDraft(fieldsOf(new URLSearchParams([...base, ...fields])));
        const ok: [string, string][] = [['name', 'Cup'], ['format', 'single_elimination'], ['seeding', 'random'], ['randomSeed', '1']];
        const swap = (key: string, value: string) => ok.map(([k, v]) => [k, k === key ? value : v] as [string, string]);
        expect(check(swap('name', 'x'.repeat(101)))).toEqual({ ok: false, error: 'name' });
        expect(check(swap('format', 'round_robin'))).toEqual({ ok: false, error: 'format' });
        expect(check(swap('seeding', 'coin'))).toEqual({ ok: false, error: 'seeding' });
        expect(check(swap('randomSeed', String(MAX_RANDOM_SEED + 1)))).toEqual({ ok: false, error: 'random-seed' });
        expect(check(swap('randomSeed', '-1'))).toEqual({ ok: false, error: 'random-seed' });
        expect(check([...ok, ['player', 'abc']])).toEqual({ ok: false, error: 'players' });
    });

    it('needs 2 to 32 different players', () => {
        const players = (ids: number[]) => ids.map((id) => ['player', String(id)] as [string, string]);
        const base: [string, string][] = [['name', 'Cup'], ['format', 'single_elimination'], ['seeding', 'random'], ['randomSeed', '1']];
        const check = (ids: number[]) => parseTournamentDraft(fieldsOf(new URLSearchParams([...base, ...players(ids)])));
        expect(check([1, 1])).toEqual({ ok: false, error: 'players' });
        expect(check(Array.from({ length: 33 }, (_, i) => i + 1))).toEqual({ ok: false, error: 'players' });
        expect(check(Array.from({ length: 32 }, (_, i) => i + 1))).toMatchObject({ ok: true });
    });

    it('reads hand seeding and refuses missing or repeated seeds', () => {
        const manual = (seeds: [string, string][]) => form([...seeds], [['name', 'Cup'], ['format', 'single_elimination'], ['seeding', 'manual'], ['randomSeed', '7'], ['player', '3'], ['player', '1'], ['player', '2']]);
        expect(parseTournamentDraft(manual([['seed_1', '2'], ['seed_2', '3'], ['seed_3', '1']]))).toMatchObject({ ok: true, value: { manualOrder: [3, 1, 2] } });
        expect(parseTournamentDraft(manual([['seed_1', '2'], ['seed_2', '2'], ['seed_3', '1']]))).toEqual({ ok: false, error: 'seeds' });
        expect(parseTournamentDraft(manual([['seed_1', '2'], ['seed_3', '1']]))).toEqual({ ok: false, error: 'seeds' });
        expect(parseTournamentDraft(manual([['seed_1', '2'], ['seed_2', '4'], ['seed_3', '1']]))).toEqual({ ok: false, error: 'seeds' });
    });

    it('reads best-of and rules per round', () => {
        const result = parseTournamentDraft(form([['bestOf_winners-2', '5'], ['rules_winners-2', 'fast.lua'], ['rules_winners-1', '']]));
        expect(result).toMatchObject({ ok: true, value: { rounds: { 'winners-2': { bestOf: 5, ruleFile: 'fast.lua' } } } });
        expect(parseTournamentDraft(form([['bestOf_winners-1', '2']]))).toEqual({ ok: false, error: 'best-of' });
        expect(parseTournamentDraft(form([['bestOf_final-1', '9']]))).toEqual({ ok: false, error: 'best-of' });
        expect(parseTournamentDraft(form([['rules_losers-3', '../etc/x.lua']]))).toEqual({ ok: false, error: 'rules' });
    });
});

describe('planTournament', () => {
    it('builds the same bracket for the same draft', () => {
        const draft = parseTournamentDraft(form([['bestOf_winners-2', '3']]));
        if (!draft.ok) throw new Error(draft.error);
        const plan = planTournament(draft.value);
        expect(planTournament(draft.value)).toEqual(plan);
        expect(plan.seeds).toHaveLength(3);
        expect(plan.rounds.map((r) => r.bestOf)).toEqual([1, 3]);
    });

    it('uses hand seeding and Elo ratings', () => {
        const draft = parseTournamentDraft(form());
        if (!draft.ok) throw new Error(draft.error);
        expect(planTournament({ ...draft.value, seeding: 'manual', manualOrder: [2, 3, 1] }).seeds).toEqual([2, 3, 1]);
        expect(planTournament({ ...draft.value, seeding: 'elo' }, new Map([[3, 1300]])).seeds).toEqual([3, 1, 2]);
    });
});

describe('helpers', () => {
    it('keeps repeated search params', () => {
        expect(toSearchParams({ player: ['1', '2'], name: 'Cup', empty: undefined }).toString()).toBe('player=1&player=2&name=Cup');
    });

    it('makes random seeds in range', () => {
        for (let i = 0; i < 20; i++) {
            const seed = newRandomSeed();
            expect(Number.isInteger(seed) && seed >= 0 && seed <= MAX_RANDOM_SEED).toBe(true);
        }
    });

    it('has a message for each error and none for unknown codes', () => {
        for (const code of ['name', 'format', 'seeding', 'random-seed', 'players', 'seeds', 'best-of', 'rules', 'no-event']) expect(tournamentErrorMessage(code)).toBeTruthy();
        expect(tournamentErrorMessage('toString')).toBeNull();
        expect(tournamentErrorMessage(undefined)).toBeNull();
    });
});

describe('describeBracket', () => {
    it('names players, the matches that feed empty slots and where players go', () => {
        const draft = parseTournamentDraft(
            fieldsOf(new URLSearchParams([['name', 'Cup'], ['format', 'double_elimination'], ['seeding', 'manual'], ['randomSeed', '1'], ['player', '1'], ['player', '2'], ['seed_1', '1'], ['seed_2', '2']])),
        );
        if (!draft.ok) throw new Error(draft.error);
        const plan = planTournament(draft.value);
        const rounds = describeBracket(plan.format, plan.matches, (id) => `P${id}`);
        expect(rounds).toEqual([
            { key: 'winners-1', name: 'Winners round 1', bestOf: 1, ruleFile: 'default.lua', matches: [{ number: 1, slots: ['P1', 'P2'], winnerTo: 'Match 2', loserTo: 'Match 2' }] },
            { key: 'final-1', name: 'Grand final', bestOf: 1, ruleFile: 'default.lua', matches: [{ number: 2, slots: ['Winner of match 1', 'Loser of match 1'], winnerTo: 'Champion', loserTo: 'Out' }] },
        ]);
    });
});
