import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SponsorMarquee } from './SponsorMarquee';

const sponsors = [
    { id: 1, name: 'Pizzabakeren', src: '/api/sponsors/1/logo?v=a', link: 'https://pizza.example.test/', background: null },
    { id: 2, name: 'Ostehuset', src: '/api/sponsors/2/logo?v=b', link: null, background: '#ffcc00' },
];

describe('the sponsor strip', () => {
    const html = renderToStaticMarkup(<SponsorMarquee sponsors={sponsors} />);

    it('holds the tiles twice, with alt text and a working link only in the first set', () => {
        expect(html.match(/<ul/g)).toHaveLength(2);
        expect(html.match(/alt="Pizzabakeren"/g)).toHaveLength(1);
        expect(html.match(/alt="Ostehuset"/g)).toHaveLength(1);
        expect(html.match(/href="https:\/\/pizza.example.test\/"/g)).toHaveLength(2);
        const [, copy] = html.split(/<ul/);
        expect(html.split(/<ul/)[2]).toContain('aria-hidden="true"');
        expect(html.split(/<ul/)[2]).toContain('tabindex="-1"');
        expect(html.split(/<ul/)[2]).toContain('alt=""');
        expect(copy).not.toContain('aria-hidden');
        expect(copy).not.toContain('tabindex');
    });

    it('puts each tile on the colour of its sponsor, or on the dark brown default', () => {
        expect(html).toContain('background:#3a2820');
        expect(html).toContain('background:#ffcc00');
    });

    it('shows nothing without sponsors', () => {
        expect(renderToStaticMarkup(<SponsorMarquee sponsors={[]} />)).toBe('');
    });
});
