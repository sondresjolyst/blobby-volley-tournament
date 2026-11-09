import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarqueeTrack, setsToFill, SponsorMarquee } from './SponsorMarquee';

const sponsors = [
    { id: 1, name: 'Pizzabakeren', src: '/api/sponsors/1/logo?v=a', link: 'https://pizza.example.test/', background: null },
    { id: 2, name: 'Ostehuset', src: '/api/sponsors/2/logo?v=b', link: null, background: '#ffcc00' },
];

const sets = (html: string) => html.split('<ul').slice(1);

describe('the sponsor strip', () => {
    it('moves from the start, with the first set read out and one hidden copy', () => {
        const html = renderToStaticMarkup(<SponsorMarquee sponsors={sponsors} />);
        const [first, copy, ...rest] = sets(html);
        expect(rest).toEqual([]);
        expect(html).toContain('--sets:2');
        expect(first).toContain('alt="Pizzabakeren"');
        expect(first).toContain('alt="Ostehuset"');
        expect(first).toContain('href="https://pizza.example.test/"');
        expect(first).not.toContain('aria-hidden');
        expect(first).not.toContain('tabindex');
        expect(copy).toContain('aria-hidden="true"');
    });

    it('repeats the set as asked, every copy hidden and out of the tab order', () => {
        const [first, ...copies] = sets(renderToStaticMarkup(<MarqueeTrack sponsors={sponsors} sets={4} />));
        expect(copies).toHaveLength(3);
        expect(first).not.toContain('aria-hidden');
        expect(first).toContain('alt="Pizzabakeren"');
        for (const copy of copies) {
            expect(copy).toContain('aria-hidden="true"');
            expect(copy).toContain('tabindex="-1"');
            expect(copy).toContain('href="https://pizza.example.test/"');
            expect(copy).not.toMatch(/alt="[^"]/);
        }
    });

    it('fills the strip with enough sets at every width, also when all tiles fit', () => {
        // Two tiles of 230 px and a gap of 12 px make a set of 472 px and a step of 484 px.
        expect(setsToFill(375, 472, 12)).toBe(2);
        expect(setsToFill(1851, 472, 12)).toBe(5);
        expect(setsToFill(2560, 472, 12)).toBe(7);
        // Six tiles in a 1851 px strip fit, and still get a copy to slide in.
        expect(setsToFill(1851, 1440, 12)).toBe(3);
        expect(setsToFill(1000, 0, 0)).toBe(2);
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
