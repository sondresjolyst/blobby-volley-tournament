import { connection } from 'next/server';
import { getPool } from '@/lib/db';
import { listShownSponsors, type SponsorRow } from '@/lib/store/sponsors';

const LOGO_HEIGHT = 40;

/** The enabled sponsors of the active event under every page. Nothing shows when there are none. */
export async function SponsorFooter() {
    // The list changes while the site runs, so it is read on each request and never at build time.
    await connection();
    let sponsors: SponsorRow[];
    try {
        sponsors = await listShownSponsors(getPool());
    } catch {
        // The page itself still works without the footer.
        console.error('Could not read the sponsors for the footer.');
        return null;
    }
    if (sponsors.length === 0) return null;
    return (
        <footer aria-label="Sponsors">
            <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5rem', padding: 0 }}>
                {sponsors.map((sponsor) => {
                    const logo = (
                        // The logo is served as it was stored. The image optimizer of Next is not used.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={`/api/sponsors/${sponsor.id}/logo?v=${sponsor.logoHash}`}
                            alt={sponsor.name}
                            height={LOGO_HEIGHT}
                            width={Math.round((LOGO_HEIGHT * sponsor.logoWidth) / sponsor.logoHeight)}
                        />
                    );
                    return (
                        <li key={sponsor.id}>
                            {sponsor.link ? (
                                <a href={sponsor.link} rel="sponsored noopener noreferrer">
                                    {logo}
                                </a>
                            ) : (
                                logo
                            )}
                        </li>
                    );
                })}
            </ul>
        </footer>
    );
}
