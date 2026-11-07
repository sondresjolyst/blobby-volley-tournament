import { describe, expect, it } from 'vitest';
import { toSyncMatch, type SyncMatchRow } from './game-server';

const row: SyncMatchRow = {
    id: 7,
    state: 'started',
    best_of: 5,
    rule_file: 'final.lua',
    score_to_win: 21,
    game_speed: 90,
    player1_id: 12,
    player2_id: 17,
    code1: 'K7QM2XPR4T',
    code2: 'B9HNZ3WD6F',
    next_game: 4,
    awaiting_decision: false,
    score1: 2,
    score2: 1,
};

describe('toSyncMatch', () => {
    it('sends the stored series score as the wins of player 1 and player 2', () => {
        expect(toSyncMatch(row)).toEqual({
            matchId: 7,
            state: 'started',
            bestOf: 5,
            nextGame: 4,
            ruleFile: 'final.lua',
            scoreToWin: 21,
            speed: 90,
            awaitingDecision: false,
            wins1: 2,
            wins2: 1,
            players: [
                { playerId: 12, code: 'K7QM2XPR4T' },
                { playerId: 17, code: 'B9HNZ3WD6F' },
            ],
        });
    });

    it('keeps the wins with their player', () => {
        expect(toSyncMatch({ ...row, score1: 0, score2: 3 })).toMatchObject({ wins1: 0, wins2: 3, players: [{ playerId: 12 }, { playerId: 17 }] });
    });
});
