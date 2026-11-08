import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarqueeTrack, SponsorMarquee } from './SponsorMarquee';

const sponsors = [
    { id: 1, name: 'Pizzabakeren', src: '/api/sponsors/1/logo?v=a', link: 'https://pizza.example.test/', background: null },
    { id: 2, name: 'Ostehuset', src: '/api/sponsors/2/logo?v=b', link: null, background: '#ffcc00' },
];

const sets = (html: string) => html.split('<ul').slice(1);

describe('the sponsor strip', () => {
    it('starts still with one set, read out with alt text and links', () => {
        const html = renderToStaticMarkup(<SponsorMarquee sponsors={sponsors} />);
        const [first, ...rest] = sets(html);
        expect(rest).toEqual([]);
        expect(first).toContain('alt="Pizzabakeren"');
        expect(first).toContain('alt="Ostehuset"');
        expect(first).toContain('href="https://pizza.example.test/"');
        expect(first).not.toContain('aria-hidden');
        expect(first).not.toContain('tabindex');
    });

    it('when moving, adds one copy that is hidden and out of the tab order', () => {
        const [first, copy, ...rest] = sets(renderToStaticMarkup(<MarqueeTrack sponsors={sponsors} moving />));
        expect(rest).toEqual([]);
        expect(first).not.toContain('aria-hidden');
        expect(first).toContain('alt="Pizzabakeren"');
        expect(copy).toContain('aria-hidden="true"');
        expect(copy).toContain('tabindex="-1"');
        expect(copy).toContain('href="https://pizza.example.test/"');
        expect(copy).not.toMatch(/alt="[^"]/);
    });

    it('puts each tile on the colour of its sponsor, or on the dark brown default', () => {
        const html = renderToStaticMarkup(<SponsorMarquee sponsors={sponsors} />);
        expect(html).toContain('background:#3a2820');
        expect(html).toContain('background:#ffcc00');
    });

    it('shows nothing without sponsors', () => {
        expect(renderToStaticMarkup(<SponsorMarquee sponsors={[]} />)).toBe('');
    });
});
