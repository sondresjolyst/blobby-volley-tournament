import { describe, expect, it } from 'vitest';
import { generateBracket } from '@/lib/bracket';
import type { MatchState } from '@/lib/matches/state';
import type { MatchPool } from '@/lib/store/bets';
import type { LiveScore } from '@/lib/store/game-server';
import type { MatchSummary } from '@/lib/store/matches';
import type { Leaderboard } from '@/lib/store/stats';
import { DEFAULT_ROTATION } from './screens';
import { compareNet } from '@/lib/stats/betting';
import { buildBigScreen, floorMatches, focusMatches, pickSide, pickTournament, roundWindow, screenBoards, screenFoza, type ScreenInput } from './view';

const names: Record<number, string> = { 11: 'Blobfisk', 12: 'Skvett', 13: 'Ostebit', 14: 'Kantina' };

function match(id: number, state: MatchState, players: [number | null, number | null], extra: Partial<MatchSummary> = {}): MatchSummary {
    const player = (p: number | null) => (p === null ? null : { id: p, nickname: names[p] });
    return {
        id,
        eventId: 1,
        tournamentId: null,
        tournamentName: null,
        bracketMatchId: null,
        roundLabel: null,
        bracketRound: null,
        state,
        bestOf: 3,
        ruleFile: 'default.lua',
        scoreToWin: 15,
        speed: 75,
        players: [player(players[0]), player(players[1])],
        acceptedAt: null,
        score1: 0,
        score2: 0,
        winnerId: null,
        result: null,
        cancelReason: null,
        ...extra,
    };
}

const live = (matchId: number, points: [number, number] | null): LiveScore => ({
    matchId,
    state: 'started',
    live: points ? { game: 2, points: [{ playerId: 0, points: points[0] }, { playerId: 0, points: points[1] }], updatedAt: '2026-11-20T18:00:00.000Z' } : null,
});

function leaderboard(): Leaderboard {
    const bettor = (playerId: number, correct: number, bets: number) => ({ playerId, bets, correct, hitRate: correct / bets, fozaWon: 0, fozaLost: 0, net: 0, biggestWin: null, bestOdds: null });
    const wins = (playerId: number, matchesWon: number) => ({
        playerId,
        matchesWon,
        matchesLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        winRate: 1,
        pointsScored: 0,
        pointsConceded: 0,
        longestStreak: 0,
        headToHead: [],
    });
    return {
        eventId: 1,
        tournamentId: null,
        nicknames: new Map(Object.entries(names).map(([id, n]) => [Number(id), n])),
        bettors: [bettor(13, 14, 19), bettor(11, 11, 17), bettor(14, 9, 15), bettor(12, 8, 16), bettor(15, 5, 12), bettor(16, 1, 2)],
        wins: [wins(11, 2), wins(12, 1)],
        elo: [
            { playerId: 11, rating: 1084.4, start: 1000, change: 84, matches: 3 },
            { playerId: 12, rating: 1031.6, start: 1000, change: 31, matches: 3 },
        ],
        placings: [],
    };
}

const pool = (matchId: number, open: boolean, stakes: [number, number], players: [number, number]): MatchPool => {
    const total = stakes[0] + stakes[1];
    return {
        matchId,
        open,
        total,
        sides: [
            { playerId: players[0], stake: stakes[0], bettors: 1, multiplier: stakes[0] ? total / stakes[0] : null },
            { playerId: players[1], stake: stakes[1], bettors: 1, multiplier: stakes[1] ? total / stakes[1] : null },
        ],
    };
};

describe('floorMatches', () => {
    it('puts started matches with a live score first, then other started ones, then called ones', () => {
        const matches = [match(1, 'called', [11, 12]), match(2, 'started', [13, 14]), match(3, 'started', [11, 13]), match(4, 'upcoming', [12, 14]), match(5, 'finished', [11, 14])];
        expect(floorMatches(matches, [live(3, [4, 6]), live(2, null)]).map((m) => m.id)).toEqual([3, 2, 1]);
    });
});

describe('pickTournament', () => {
    const matches = [match(1, 'finished', [11, 12], { tournamentId: 7 }), match(2, 'upcoming', [13, 14], { tournamentId: 8 }), match(3, 'started', [11, 13], { tournamentId: 9 })];

    it('takes a wanted tournament of the event', () => {
        expect(pickTournament([9, 8, 7], matches, [], 7)).toBe(7);
    });

    it('takes the tournament of the match on the floor when the wanted one is not in the event', () => {
        expect(pickTournament([9, 8, 7], matches, [], 99)).toBe(9);
    });

    it('takes the newest tournament with a match left, then the newest', () => {
        expect(pickTournament([9, 8, 7], matches.slice(0, 2), [], null)).toBe(8);
        expect(pickTournament([9, 7], matches.slice(0, 1), [], null)).toBe(9);
        expect(pickTournament([], [], [], null)).toBeNull();
    });
});

describe('roundWindow', () => {
    const round = (...states: MatchState[]) => ({ matches: states.map((state) => ({ state })) });

    it('starts at the first round with a match left and keeps the window full', () => {
        const rounds = [round('finished', 'finished'), round('finished', 'started'), round('upcoming'), round('upcoming'), round('upcoming'), round('upcoming')];
        expect(roundWindow(rounds, 4)).toEqual(rounds.slice(1, 5));
        expect(roundWindow(rounds.slice(0, 3), 4)).toEqual(rounds.slice(0, 3));
        const done = [round('finished'), round('finished'), round('finished'), round('finished'), round('cancelled')];
        expect(roundWindow(done, 4)).toEqual(done.slice(1));
    });
});

describe('focusMatches', () => {
    it('keeps live, called and open matches first, in bracket order', () => {
        const states: MatchState[] = ['finished', 'finished', 'upcoming', 'finished', 'started', 'called', 'upcoming', 'finished'];
        const matches = states.map((state, i) => ({ state, i }));
        expect(focusMatches(matches, 4).map((m) => m.i)).toEqual([2, 4, 5, 6]);
        expect(focusMatches(matches.slice(0, 3), 4)).toEqual(matches.slice(0, 3));
    });
});

describe('pickSide', () => {
    const side = (key: 'main' | 'losers', ...states: MatchState[]) => ({ key, rounds: [{ matches: states.map((state) => ({ state })) }] });

    it('shows the side with the most urgent match, the winners side on a tie', () => {
        expect(pickSide([side('main', 'upcoming'), side('losers', 'started')]).key).toBe('losers');
        expect(pickSide([side('main', 'called'), side('losers', 'called')]).key).toBe('main');
        expect(pickSide([side('main', 'finished'), side('losers', 'upcoming')]).key).toBe('losers');
        expect(pickSide([side('main', 'finished'), side('losers', 'finished')]).key).toBe('main');
        expect(pickSide([side('main', 'finished')]).key).toBe('main');
    });
});

describe('screenBoards', () => {
    it('ranks bettors by Foza won net, like the Foza screen, and shows the top five of each board', () => {
        const board = leaderboard();
        const net: Record<number, number> = { 11: 300, 12: 120, 13: 50, 14: -20, 15: 0, 16: 10 };
        // The store hands the bettors over in this order.
        board.bettors = board.bettors.map((b) => ({ ...b, net: net[b.playerId] })).sort(compareNet);
        const [foza, sigra, elo] = screenBoards(board);
        expect(foza.key).toBe('foza');
        expect(foza.rows.map((r) => r.nickname)).toEqual(['Blobfisk', 'Skvett', 'Ostebit', 'Spelar 16', 'Spelar 15']);
        expect(foza.rows[0]).toEqual({ rank: 1, nickname: 'Blobfisk', value: '+300' });
        expect(foza.rows[4]).toEqual({ rank: 5, nickname: 'Spelar 15', value: '0' });
        expect(foza.rows.map((r) => r.nickname)).toEqual(screenFoza(board).bettors.slice(0, 5).map((b) => b.nickname));
        expect(sigra.rows).toEqual([
            { rank: 1, nickname: 'Blobfisk', value: '2 seira' },
            { rank: 2, nickname: 'Skvett', value: '1 seier' },
        ]);
        expect(elo.rows.map((r) => r.value)).toEqual(['1084', '1032']);
    });
});

describe('buildBigScreen', () => {
    function input(extra: Partial<ScreenInput> = {}): ScreenInput {
        return { event: { id: 1, name: 'JulaLAN' }, matches: [], pools: [], live: [], leaderboard: leaderboard(), tournament: null, sponsors: [], series: [], rotation: DEFAULT_ROTATION, ...extra };
    }

    it('features the live match with its score, sets, Elo and pool, and lists the next matches open for bets', () => {
        const matches = [match(1, 'started', [11, 12], { score1: 1, score2: 0 }), match(2, 'upcoming', [13, 14]), match(3, 'upcoming', [11, 14]), match(4, 'upcoming', [12, null])];
        const data = buildBigScreen(
            input({
                matches,
                pools: [pool(1, false, [2666, 1634], [11, 12]), pool(2, true, [100, 300], [13, 14]), pool(3, false, [0, 0], [11, 14]), { matchId: 4, open: false, total: 0, sides: [] }],
                live: [live(1, [11, 8])],
            }),
        );
        expect(data.featured).toMatchObject({ matchId: 1, label: '1v1-utfordring', live: { game: 2, points: [11, 8] }, pool: 4300, bestOf: 3 });
        expect(data.featured!.sides[0]).toMatchObject({ nickname: 'Blobfisk', sets: 1, elo: 1084, stake: 2666 });
        expect(data.featured!.sides[1]).toMatchObject({ nickname: 'Skvett', sets: 0, elo: 1032 });
        expect(data.others.map((m) => m.matchId)).toEqual([2]);
        expect(data.others[0].sides[1].multiplier).toBeCloseTo(4 / 3);
    });

    it('features the next match open for bets when nothing is on the floor', () => {
        const data = buildBigScreen(input({ matches: [match(2, 'upcoming', [13, 14])], pools: [pool(2, true, [0, 0], [13, 14])] }));
        expect(data.featured).toMatchObject({ matchId: 2, state: 'upcoming', live: null, pool: 0, open: true });
        expect(data.featured!.sides[0].elo).toBe(1000);
        expect(data.others).toEqual([]);
    });

    it('lays out the bracket of the tournament with nicknames only', () => {
        const bracket = generateBracket({ format: 'single_elimination', players: [11, 12, 13, 14], seeding: { method: 'manual', order: [11, 12, 13, 14] }, thirdPlaceMatch: false });
        const runtime = bracket.matches.map((m, i) =>
            match(100 + m.id, i === 0 ? 'finished' : i === 1 ? 'started' : 'upcoming', [m.players[0], m.players[1]], {
                tournamentId: 5,
                tournamentName: 'Hovedcupen',
                bracketMatchId: m.id,
                bracketRound: { format: 'single_elimination', section: m.section, round: m.round, lastRound: 2, position: m.position },
                ...(i === 0 ? { score1: 2, score2: 0, winnerId: 11, result: 'played' as const } : {}),
            }),
        );
        const data = buildBigScreen(input({ matches: runtime, tournament: { id: 5, name: 'Hovedcupen', format: 'single_elimination', matches: bracket.matches } }));
        expect(data.bracket).toMatchObject({ tournamentId: 5, name: 'Hovedcupen', side: null, rows: 2 });
        const [semis, final] = data.bracket!.rounds;
        expect(semis.name).toBe('Semifinala');
        expect(semis.matches[0].slots).toEqual([
            { name: 'Blobfisk', score: 2, outcome: 'won' },
            { name: 'Kantina', score: 0, outcome: 'lost' },
        ]);
        expect(final.matches[0].slots.map((s) => s.name)).toEqual(['Vinnar av kamp 1', 'Vinnar av kamp 2']);
        expect(JSON.stringify(data.bracket)).not.toMatch(/playerId|mine/);
        expect(data.featured!.label).toBe('Semifinala, kamp 2');
    });

    it('lays out every round of every side for the bracket screen', () => {
        const ids = Array.from({ length: 16 }, (_, i) => 100 + i);
        const bracket = generateBracket({ format: 'double_elimination', players: ids, seeding: { method: 'manual', order: ids }, thirdPlaceMatch: false });
        const runtime = bracket.matches.map((m) =>
            match(1000 + m.id, 'upcoming', [m.players[0], m.players[1]], {
                tournamentId: 6,
                bracketMatchId: m.id,
            }),
        );
        const data = buildBigScreen(input({ matches: runtime, tournament: { id: 6, name: 'Storcupen', format: 'double_elimination', matches: bracket.matches } }));
        const full = data.fullBracket!;
        expect(full.sections.map((s) => s.key)).toEqual(['main', 'losers']);
        const shown = full.sections.flatMap((s) => s.rounds.flatMap((r) => r.matches));
        expect(shown).toHaveLength(bracket.matches.length);
        expect(full.sections.every((s) => s.rounds.every((r) => r.more === 0))).toBe(true);
        expect(full.sections[0].rows).toBe(8);
        // Eight matches in a round make it dense, so empty slots get short names there, and only there.
        expect(full.dense).toBe(true);
        expect(full.sections[0].rounds[1].matches[0].slots.map((s) => s.name)).toEqual(['Vinnar k. 1', 'Vinnar k. 2']);
        expect(full.sections[1].rounds[0].matches[0].slots.map((s) => s.name)).toEqual(['Taper k. 1', 'Taper k. 2']);
        // The overview keeps its window of four matches a round and the long names.
        expect(data.bracket!.rounds[0].matches).toHaveLength(4);
        expect(buildBigScreen(input()).fullBracket).toBeNull();
    });

    it('lists the matches on the floor, then the next ones that can be called, at most eight', () => {
        const matches = [
            match(1, 'finished', [11, 12]),
            match(2, 'upcoming', [11, 13], { acceptedAt: new Date() }),
            match(3, 'upcoming', [12, 14]),
            match(4, 'called', [13, 14]),
            match(5, 'upcoming', [11, null], { tournamentId: 5 }),
            match(6, 'upcoming', [12, 13], { tournamentId: 5 }),
            match(7, 'started', [11, 12]),
            ...Array.from({ length: 9 }, (_, i) => match(20 + i, 'upcoming', [11, 14], { tournamentId: 5 })),
        ];
        const data = buildBigScreen(input({ matches, live: [live(7, [9, 4])] }));
        expect(data.upNext.map((m) => m.matchId)).toEqual([7, 4, 2, 6, 20, 21, 22, 23]);
        expect(data.upNext[0].live).toEqual({ game: 2, points: [9, 4] });
        expect(buildBigScreen(input()).upNext).toEqual([]);
    });

    it('ranks the bettors by Foza won and lists the biggest wins, one per bettor', () => {
        const board = leaderboard();
        const bettor = board.bettors[0];
        board.bettors = [
            { ...bettor, playerId: 11, net: -50, correct: 1, bets: 3, biggestWin: { matchId: 1, onPlayerId: 12, value: 30 } },
            { ...bettor, playerId: 12, net: 400, correct: 2, bets: 2, biggestWin: { matchId: 2, onPlayerId: 13, value: 380 } },
            { ...bettor, playerId: 13, net: 90, correct: 0, bets: 1, biggestWin: null },
        ];
        const { foza } = buildBigScreen(input({ leaderboard: board }));
        expect(foza.bettors).toEqual([
            { nickname: 'Skvett', net: 400, correct: 2, bets: 2 },
            { nickname: 'Ostebit', net: 90, correct: 0, bets: 1 },
            { nickname: 'Blobfisk', net: -50, correct: 1, bets: 3 },
        ]);
        expect(foza.wins).toEqual([
            { nickname: 'Skvett', on: 'Ostebit', profit: 380 },
            { nickname: 'Blobfisk', on: 'Skvett', profit: 30 },
        ]);
        expect(buildBigScreen(input({ leaderboard: { ...board, bettors: [] } })).foza).toEqual({ bettors: [], wins: [] });
    });

    it('takes the final from the last stage of the bracket, not from the order of the match list', () => {
        const de = { format: 'double_elimination' as const, position: 1 };
        // The grand final has the lowest id, so list order alone would pick the wrong match.
        const matches = [
            match(2, 'finished', [11, 12], { tournamentId: 5, bracketRound: { ...de, section: 'final', round: 1, lastRound: 1 }, winnerId: 11, result: 'played', score1: 3, score2: 1 }),
            match(9, 'finished', [11, 13], { tournamentId: 5, bracketRound: { ...de, section: 'winners', round: 3, lastRound: 3 }, winnerId: 11, result: 'played', score1: 2 }),
            match(12, 'finished', [11, 14], { tournamentId: 5, bracketRound: { ...de, section: 'winners', round: 1, lastRound: 3 }, winnerId: 11, result: 'played', score1: 2 }),
        ];
        const board = leaderboard();
        board.placings = [{ tournamentId: 5, tournamentName: 'Storcupen', playerId: 11, place: 1 }];
        expect(buildBigScreen(input({ matches, leaderboard: board })).winner?.final).toEqual({
            round: 'Storfinale',
            sides: [
                { name: 'Blobfisk', score: 3 },
                { name: 'Skvett', score: 1 },
            ],
        });
        // A grand final decided by a no-show has no score to show.
        const forfeit = matches.map((m) => (m.id === 2 ? { ...m, result: 'forfeit' as const } : m));
        expect(buildBigScreen(input({ matches: forfeit, leaderboard: board })).winner?.final).toBeNull();
    });

    it('has no winner before a tournament has a champion, then shows the champion, the final and the podium', () => {
        expect(buildBigScreen(input()).winner).toBeNull();
        const round = { format: 'single_elimination' as const, section: 'winners' as const, round: 2, lastRound: 2, position: 1 };
        const matches = [
            match(1, 'finished', [11, 14], { tournamentId: 5, bracketRound: { ...round, round: 1 }, winnerId: 11, result: 'played', score1: 2 }),
            match(3, 'finished', [11, 12], { tournamentId: 5, bracketRound: round, winnerId: 11, result: 'played', score1: 2, score2: 1 }),
        ];
        const board = leaderboard();
        board.placings = [
            { tournamentId: 5, tournamentName: 'Hovedcupen', playerId: 11, place: 1 },
            { tournamentId: 5, tournamentName: 'Hovedcupen', playerId: 12, place: 2 },
            { tournamentId: 5, tournamentName: 'Hovedcupen', playerId: 13, place: 3 },
            { tournamentId: 5, tournamentName: 'Hovedcupen', playerId: 14, place: 3 },
        ];
        expect(buildBigScreen(input({ matches, leaderboard: { ...board, placings: board.placings.slice(1) } })).winner).toBeNull();
        expect(buildBigScreen(input({ matches, leaderboard: board })).winner).toEqual({
            tournamentId: 5,
            tournamentName: 'Hovedcupen',
            champion: 'Blobfisk',
            podium: [
                { place: 2, names: ['Skvett'] },
                { place: 3, names: ['Ostebit', 'Kantina'] },
            ],
            final: { round: 'Finale', sides: [{ name: 'Blobfisk', score: 2 }, { name: 'Skvett', score: 1 }] },
        });
    });

    it('carries the rotation of the event', () => {
        expect(buildBigScreen(input({ rotation: { screens: ['stats', 'overview'], seconds: 30 } })).rotation).toEqual({ screens: ['stats', 'overview'], seconds: 30 });
    });

    it('links the sponsor logos with their hash', () => {
        const sponsor = { id: 3, eventId: 1, name: 'Pizzabakeren', link: null, position: 1, enabled: true, gameBackground: null, logoType: 'image/png' as const, logoWidth: 300, logoHeight: 100, logoHash: 'ab12', gameLogoHash: 'cd34' };
        expect(buildBigScreen(input({ sponsors: [sponsor] })).sponsors).toEqual([{ id: 3, name: 'Pizzabakeren', src: '/api/sponsors/3/logo?v=ab12', width: 300, height: 100 }]);
    });
});
