export interface SponsorInput {
    name: string;
    /** An http or https address, or null for no link. */
    link: string | null;
    enabled: boolean;
    /**
     * The colour behind transparent parts of the game logo, as #rrggbb in lower case. Null keeps
     * them transparent, so the board in the game shows through.
     */
    gameBackground: string | null;
}

export const MAX_NAME_LENGTH = 60;
export const MAX_LINK_LENGTH = 500;

const COLOUR = /^#[0-9a-f]{6}$/;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** An http or https address without a user name or password, or null when it is anything else. */
function parseLink(value: string): string | null {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username !== '' || url.password !== '') return null;
    return url.href.length <= MAX_LINK_LENGTH ? url.href : null;
}

export type SponsorInputResult = { ok: true; value: SponsorInput } | { ok: false; error: string };

/**
 * Reads the sponsor form. An empty link means no link. A checkbox that is not sent means off. The
 * colour is only read when the own background box is checked.
 */
export function parseSponsorInput(form: Record<string, unknown>): SponsorInputResult {
    const name = text(form.name);
    if (name.length < 1 || name.length > MAX_NAME_LENGTH) return { ok: false, error: 'sponsor-name' };
    const rawLink = text(form.link);
    const link = rawLink === '' ? null : parseLink(rawLink);
    if (rawLink !== '' && link === null) return { ok: false, error: 'sponsor-link' };
    const background = form.ownBackground === 'on' ? text(form.gameBackground).toLowerCase() : null;
    if (background !== null && !COLOUR.test(background)) return { ok: false, error: 'sponsor-background' };
    return { ok: true, value: { name, link, enabled: form.enabled === 'on', gameBackground: background } };
}

/** Reads the direction of a move, or null. */
export function parseDirection(value: unknown): 'up' | 'down' | null {
    return value === 'up' || value === 'down' ? value : null;
}

/** The styles of the sponsor board in the game. Off shows no board. */
export const GAME_BOARDS = ['off', 'led', 'printed', 'wood', 'slim', 'padded'] as const;
export type GameBoard = (typeof GAME_BOARDS)[number];

/** Reads a board style, or null. */
export function parseGameBoard(value: unknown): GameBoard | null {
    return typeof value === 'string' && (GAME_BOARDS as readonly string[]).includes(value) ? (value as GameBoard) : null;
}
