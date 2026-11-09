import { describe, expect, it } from 'vitest';
import { hardestBeatenLine, trainingCounts, trainingErrorMessage, trainingNoticeMessage, trainingSettings, trainingVersus } from './text';

describe('training texts', () => {
    it('describes a training match as training against a bot', () => {
        expect(trainingVersus('Ola', 'hyp014', 13)).toBe('Ola vs Bot (hyp014, vanskegrad 13)');
        expect(trainingSettings('default.lua', 15)).toBe('Regla default.lua · først te 15');
        expect(trainingCounts(12, 5, 7)).toBe('Spelt 12 · vunne 5 · tapt 7');
        expect(hardestBeatenLine('Union', 2)).toBe('Tøffaste bot du har slått: Union på vanskegrad 2');
    });

    it('has a text for every error and notice code and nothing for unknown ones', () => {
        for (const code of ['form', 'settings', 'no-event', 'player-busy', 'taken', 'not-found']) expect(trainingErrorMessage(code)).toBeTruthy();
        for (const code of ['started', 'stopped']) expect(trainingNoticeMessage(code)).toBeTruthy();
        expect(trainingErrorMessage('toString')).toBeNull();
        expect(trainingErrorMessage(['taken'])).toBeNull();
        expect(trainingNoticeMessage(undefined)).toBeNull();
    });
});
