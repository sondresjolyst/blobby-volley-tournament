import { readUploadForm } from '@/lib/http';
import { parseSponsorInput, type SponsorInput } from './input';
import { checkLogo, MAX_LOGO_BYTES, type CheckedLogo } from './logo';

/** The largest sponsor form read: the logo and some room for the other fields. */
export const MAX_FORM_BYTES = MAX_LOGO_BYTES + 16 * 1024;

export type SponsorForm = { ok: true; input: SponsorInput; logo: CheckedLogo | null } | { ok: false; error: string };

/** Reads the add or edit form of a sponsor. The logo is null when no file was picked. */
export async function readSponsorForm(req: Request): Promise<SponsorForm> {
    const form = await readUploadForm(req, MAX_FORM_BYTES);
    if (form === 'too-large') return { ok: false, error: 'logo-size' };
    const input = parseSponsorInput(form.fields);
    if (!input.ok) return input;
    const file = form.files.logo;
    if (!file) return { ok: true, input: input.value, logo: null };
    const logo = await checkLogo(file);
    if (!logo.ok) return logo;
    return { ok: true, input: input.value, logo: logo.value };
}
