import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SCREEN_TYPES, type ScreenType } from '@/lib/big-screen/screens';
import { EMPTY_SCREEN, type BigScreenData, type ScreenMatch } from '@/lib/big-screen/view';
import { BigScreen } from './BigScreen';
import { BracketScreen, DuelScreen, FozaScreen, sponsorColumns, SponsorScreen, StatsScreen, UpNextScreen, WinnerScreen } from './screens';
import { BOARD_TEXT, DUEL_TEXT, NO_BRACKET, NO_FACTS, NO_MATCH, NO_SPONSORS } from './text';

const CODE = 'OSTAPOPP-2026';

const side = (nickname: string, sets: number) => ({ nickname, elo: 1000, sets, stake: 0, multiplier: null });
const match = (matchId: number, state: ScreenMatch['state'], names: [string, string], live: ScreenMatch['live'] = null): ScreenMatch => ({
    matchId,
    state,
    label: 'Semifinala, kamp 1',
    tournamentName: 'Hovedcupen',
    bestOf: 3,
    live,
    pool: 0,
    open: state === 'upcoming',
    sides: [side(names[0], 1), side(names[1], 0)],
});

const empty: BigScreenData = { ...EMPTY_SCREEN, eventId: 1, eventName: 'JulaLAN' };

const full: BigScreenData = {
    ...empty,
    boards: [{ key: 'foza', rows: [{ rank: 1, nickname: 'Tippekongen', value: '4 av 5' }] }],
    sponsors: [
        { id: 1, name: 'Pizzabakeren', src: '/api/sponsors/1/logo?v=a', width: 300, height: 100, background: null },
        { id: 2, name: 'Ostehuset', src: '/api/sponsors/2/logo?v=b', width: 300, height: 100, background: '#1e5aa8' },
    ],
    fullBracket: {
        tournamentId: 5,
        name: 'Hovedcupen',
        dense: false,
        sections: [
            {
                key: 'main',
                rows: 2,
                rounds: [
                    {
                        key: 'winners-1',
                        name: 'Semifinala',
                        more: 0,
                        matches: [
                            { matchId: 1, state: 'finished', slots: [{ name: 'Blobfisk', score: 2, outcome: 'won' }, { name: 'Kantina', score: 0, outcome: 'lost' }] },
                            { matchId: 2, state: 'started', slots: [{ name: 'Skvett', score: 1, outcome: null }, { name: 'Ostebit', score: 0, outcome: null }] },
                        ],
                    },
                    { key: 'winners-2', name: 'Finale', more: 0, matches: [{ matchId: 3, state: 'upcoming', slots: [{ name: 'Blobfisk', score: null, outcome: null }, { name: 'Vinnar av kamp 2', score: null, outcome: null }] }] },
                ],
            },
            { key: 'losers', rows: 1, rounds: [{ key: 'losers-1', name: 'Taperrunde 1', more: 0, matches: [{ matchId: 4, state: 'upcoming', slots: [{ name: 'Kantina', score: null, outcome: null }, { name: 'Taper av kamp 2', score: null, outcome: null }] }] }] },
        ],
    },
    upNext: [match(2, 'started', ['Skvett', 'Ostebit'], { game: 2, points: [11, 8] }), match(3, 'upcoming', ['Blobfisk', 'Kantina'])],
    foza: { bettors: [{ nickname: 'Tippekongen', net: 840, correct: 4, bets: 5 }], wins: [{ nickname: 'Tippekongen', on: 'Skvett', profit: 600 }] },
    facts: [
        { key: 'biggestWin', label: 'Største seier i eit sett', value: '15–0', who: 'Blobfisk mot Kantina' },
        { key: 'longest', label: 'Lengste kamp', value: '31 min', who: 'Skvett mot Ostebit' },
    ],
    winner: {
        tournamentId: 5,
        tournamentName: 'Hovedcupen',
        champion: 'Blobfisk',
        podium: [{ place: 2, names: ['Skvett'] }],
        final: { round: 'Finale', sides: [{ name: 'Blobfisk', score: 2 }, { name: 'Skvett', score: 1 }] },
    },
    duels: {
        live: [
            { ...match(7, 'started', ['Pølsa', 'Lompa'], { game: 1, points: [9, 4] }), label: '1v1', tournamentName: null, pool: 400, scoreToWin: 21, speed: 90 },
            { ...match(8, 'called', ['Taco', 'Nacho']), label: '1v1', tournamentName: null, open: true, scoreToWin: 15, speed: 75, bestOf: 1 },
        ],
        liveMore: 2,
        done: [
            { matchId: 9, result: 'played', sides: [{ nickname: 'Brunost', sets: 2, won: true }, { nickname: 'Gomme', sets: 1, won: false }] },
            { matchId: 10, result: 'forfeit', sides: [{ nickname: 'Rakfisk', sets: 0, won: false }, { nickname: 'Lutefisk', sets: 0, won: true }] },
        ],
        coming: [match(2, 'called', ['Skvett', 'Ostebit']), match(3, 'upcoming', ['Blobfisk', 'Kantina'])],
    },
};

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe('the bracket screen', () => {
    it('shows every round of both sides', () => {
        const out = html(<BracketScreen data={full} />);
        for (const text of ['Heile kampoppsettet', 'Kampoppsett · Hovedcupen', 'Vinnarsidå', 'Tapersidå', 'Semifinala', 'Finale', 'Taperrunde 1', 'Taper av kamp 2']) expect(out).toContain(text);
        expect(out).toContain('--card-max:34');
    });

    it('says there is no bracket yet', () => {
        expect(html(<BracketScreen data={empty} />)).toContain(NO_BRACKET);
    });
});

describe('the Foza screen', () => {
    it('ranks the bettors and lists the biggest wins', () => {
        const out = html(<FozaScreen data={full} />);
        for (const text of ['Mest Foza vunne', 'Tippekongen', '4 av 5 rette', '+840', 'Største gevinsta', 'på Skvett', '+600', 'Ledig plass']) expect(out).toContain(text);
    });

    it('says nobody has bet yet', () => {
        expect(html(<FozaScreen data={empty} />)).toContain(BOARD_TEXT.foza.empty.replace('!', ''));
    });
});

describe('the up next screen', () => {
    it('lists the matches with the live score of the running one', () => {
        const out = html(<UpNextScreen data={full} />);
        for (const text of ['Snart i ringen', 'LIVE', '11–8', 'Sett 2 · 1–0 i sett · best av 3', 'SNART', 'Blobfisk', 'Ingen spel ennå']) expect(out).toContain(text);
        expect(out.indexOf('Skvett')).toBeLessThan(out.indexOf('Blobfisk'));
    });

    it('says nothing is on', () => {
        expect(html(<UpNextScreen data={empty} />)).toContain(NO_MATCH.title);
    });
});

describe('the 1v1 screen', () => {
    it('shows the 1v1 matches on the floor, the latest results and the next tournament matches', () => {
        const out = html(<DuelScreen data={full} />);
        for (const text of [
            '1v1 og neste kampa',
            '1v1 i ringen',
            'Pølsa',
            'LIVE',
            '9–4',
            'Sett 1 · 1–0 i sett · Best av 3 · først te 21 · 90 fps',
            '400 Foza i potten',
            'KLAR',
            'Taco',
            'Spelå e åpne · ingen spel ennå',
            '+ 2 kampa te',
            'Neste i turneringa',
            'ROPT OPP',
            'Semifinala, kamp 1 · Hovedcupen · best av 3',
            'SNART',
            'Tidligere kampa',
            'Brunost',
            '2–1',
            'walkover',
        ])
            expect(out).toContain(text);
        expect(out.indexOf('Skvett')).toBeLessThan(out.indexOf('Kantina'));
    });

    it('says so in one line when a part is empty', () => {
        const out = html(<DuelScreen data={{ ...full, duels: { ...full.duels, live: [], liveMore: 0, coming: [] } }} />);
        expect(out).toContain(DUEL_TEXT.noLive(null));
        expect(out).toContain(DUEL_TEXT.noComing);
        expect(html(<DuelScreen data={{ ...full, duels: { ...full.duels, done: [] } }} />)).toContain(DUEL_TEXT.noDone);
    });

    it('says nothing is on at all', () => {
        const out = html(<DuelScreen data={empty} />);
        expect(out).toContain(DUEL_TEXT.empty(null).replace('!', ''));
        expect(out).not.toContain(DUEL_TEXT.live);
    });
});

describe('the stats screen', () => {
    it('shows the records it has, and only those', () => {
        const out = html(<StatsScreen data={full} />);
        for (const text of ['Rekorda', 'Største seier i eit sett', '15–0', 'Lengste kamp', '31 min']) expect(out).toContain(text);
        expect(out).not.toContain('Største snuoperasjon');
    });

    it('says nothing is played yet', () => {
        expect(html(<StatsScreen data={empty} />)).toContain(NO_FACTS);
    });
});

describe('the sponsor screen', () => {
    it('shows every logo', () => {
        const out = html(<SponsorScreen data={full} />);
        expect(out).toContain('Stolt sponsa av');
        expect(out).toContain('alt="Pizzabakeren"');
        expect(out).toContain('alt="Ostehuset"');
    });

    it('puts each logo on the background colour of its sponsor, or on the dark brown tile', () => {
        const out = html(<SponsorScreen data={full} />);
        expect(out).toContain('style="background:#3a2820"');
        expect(out).toContain('style="background:#1e5aa8"');
    });

    it('says there are no sponsors yet', () => {
        expect(html(<SponsorScreen data={empty} />)).toContain(NO_SPONSORS);
    });

    it('picks columns that keep the tiles big', () => {
        expect([1, 2, 4, 5, 9, 12, 16, 32].map(sponsorColumns)).toEqual([1, 2, 2, 3, 3, 4, 4, 8]);
    });
});

describe('the winner screen', () => {
    it('shows the champion, the final and the podium', () => {
        const out = html(<WinnerScreen data={full} />);
        for (const text of ['Me har ein vinnar!', 'Vinnaren av Hovedcupen', 'Blobfisk', 'Finale', '2–1', '2. plass', 'Skvett']) expect(out).toContain(text);
    });

    it('draws nothing without a winner', () => {
        expect(html(<WinnerScreen data={empty} />)).toBe('');
    });
});

describe('the big screen', () => {
    const page = (data: BigScreenData, pinned: ScreenType | null) => html(<BigScreen initial={data} tournament={null} screenKey={null} qr={null} pinned={pinned} />);

    it('shows the overview by default, as before', () => {
        const out = page(full, null);
        expect(out).toContain('data-screen="overview"');
        expect(out).toContain('aria-label="Toppliste"');
        expect(out).toContain('aria-label="Kampoppsett"');
    });

    it('starts on the first screen of the rotation', () => {
        expect(page({ ...full, rotation: { screens: ['stats', 'overview'], seconds: 60 } }, null)).toContain('data-screen="stats"');
        expect(page({ ...full, rotation: { screens: ['winner', 'overview'], seconds: 60 } }, null)).toContain('aria-label="Vinnaren"');
    });

    it('keeps the winner screen out of the rotation without a winner', () => {
        const out = page({ ...full, winner: null, rotation: { screens: ['winner', 'next'], seconds: 60 } }, null);
        expect(out).toContain('data-screen="next"');
        expect(out).not.toContain('Me har ein vinnar!');
    });

    it('shows a pinned screen whatever the rotation is', () => {
        expect(page(full, 'sponsors')).toContain('data-screen="sponsors"');
        expect(page(full, 'sponsors')).not.toContain('aria-label="Stolt sponsa av"');
        expect(page(full, 'bracket')).toContain('aria-label="Stolt sponsa av"');
    });

    it('shows the event code on every screen with the key', () => {
        for (const type of SCREEN_TYPES) expect(page({ ...full, eventCode: CODE }, type)).toContain(CODE);
    });
});
