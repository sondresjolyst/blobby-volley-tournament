import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { seeOther } from '@/lib/http';
import { readSponsorForm } from '@/lib/sponsors/form';
import { makeGameLogo } from '@/lib/sponsors/logo';
import { createLibrarySponsor } from '@/lib/store/sponsors';

/** Adds a sponsor to the library, from /admin/sponsors. */
export async function POST(req: Request) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const back = (query: string) => seeOther(`/admin/sponsors?${query}`);
    const form = await readSponsorForm(req);
    if (!form.ok) return back(`error=${form.error}`);
    if (!form.logo) return back('error=logo-missing');
    let gameLogo: Uint8Array;
    try {
        gameLogo = await makeGameLogo(form.logo, form.input.gameBackground);
    } catch {
        return back('error=logo-image');
    }
    const result = await createLibrarySponsor(getPool(), form.input, form.logo, gameLogo);
    if (!result.ok) return back('error=library-limit');
    return back(`saved=${result.id}`);
}
