import { describe, expect, it } from 'vitest';
import { downloadText, fileSize, versionLine } from './text';

describe('download texts', () => {
    it('writes the file size in MB with a decimal comma', () => {
        expect(fileSize(31457280)).toBe('30 MB');
        expect(fileSize(25690112)).toBe('24,5 MB');
        expect(fileSize(15360)).toBe('15 kB');
        expect(fileSize(0)).toBe('');
    });

    it('writes the version with the date', () => {
        expect(versionLine('0.1.1', '2026-11-08T18:30:00Z')).toBe('Versjon 0.1.1 · 8. november 2026');
        expect(versionLine('0.1.1', null)).toBe('Versjon 0.1.1');
        expect(versionLine('0.1.1', 'not a date')).toBe('Versjon 0.1.1');
    });

    it('names the system on the button', () => {
        expect(downloadText({ os: 'macos', arch: 'arm64' })).toBe('Last ned for Mac med M1 eller nyare');
        expect(downloadText({ os: 'windows', arch: 'x64' })).toBe('Last ned for Windows');
    });
});
