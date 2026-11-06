import { describe, expect, it } from 'vitest';
import { parseDirection, parseSponsorInput } from './input';

const form = (change: Record<string, unknown> = {}) => ({ name: ' Acme ', link: '', gameBackground: '#FFFFFF', enabled: 'on', ...change });

describe('parseSponsorInput', () => {
    it('reads a sponsor with no link', () => {
        expect(parseSponsorInput(form())).toEqual({ ok: true, value: { name: 'Acme', link: null, enabled: true, gameBackground: '#ffffff' } });
    });

    it('reads an unchecked box as off and a missing colour as white', () => {
        expect(parseSponsorInput(form({ enabled: undefined, gameBackground: undefined }))).toEqual({ ok: true, value: { name: 'Acme', link: null, enabled: false, gameBackground: '#ffffff' } });
    });

    it('keeps an http or https link in its normal form', () => {
        expect(parseSponsorInput(form({ link: 'https://Example.test/a b' }))).toMatchObject({ ok: true, value: { link: 'https://example.test/a%20b' } });
        expect(parseSponsorInput(form({ link: 'http://example.test' }))).toMatchObject({ ok: true, value: { link: 'http://example.test/' } });
    });

    it.each(['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.test', 'example.test', 'https://user:pass@example.test', `https://example.test/${'a'.repeat(500)}`])('refuses the link %s', (link) => {
        expect(parseSponsorInput(form({ link }))).toEqual({ ok: false, error: 'sponsor-link' });
    });

    it('refuses an empty or too long name', () => {
        expect(parseSponsorInput(form({ name: '  ' }))).toEqual({ ok: false, error: 'sponsor-name' });
        expect(parseSponsorInput(form({ name: 'a'.repeat(61) }))).toEqual({ ok: false, error: 'sponsor-name' });
        expect(parseSponsorInput(form({ name: 'a'.repeat(60) })).ok).toBe(true);
    });

    it.each(['red', '#fff', '#12345g', 'ffffff'])('refuses the colour %s', (gameBackground) => {
        expect(parseSponsorInput(form({ gameBackground }))).toEqual({ ok: false, error: 'sponsor-background' });
    });
});

describe('parseDirection', () => {
    it('reads up and down only', () => {
        expect(parseDirection('up')).toBe('up');
        expect(parseDirection('down')).toBe('down');
        expect(parseDirection('left')).toBeNull();
        expect(parseDirection(undefined)).toBeNull();
    });
});
