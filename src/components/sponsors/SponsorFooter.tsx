import { connection } from 'next/server';
import { SPONSORS_LABEL } from '@/components/site/text';
import { getPool } from '@/lib/db';
import { listShownSponsors, type SponsorRow } from '@/lib/store/sponsors';
import { SponsorMarquee } from './SponsorMarquee';

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
        <footer aria-label={SPONSORS_LABEL} data-label={SPONSORS_LABEL}>
            <SponsorMarquee
                sponsors={sponsors.map((sponsor) => ({
                    id: sponsor.id,
                    name: sponsor.name,
                    src: `/api/sponsors/${sponsor.id}/logo?v=${sponsor.logoHash}`,
                    link: sponsor.link,
                    background: sponsor.gameBackground,
                }))}
            />
        </footer>
    );
}
