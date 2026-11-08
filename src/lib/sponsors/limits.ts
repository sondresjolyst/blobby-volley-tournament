// The limits of sponsor logos. This file has no server code, so the admin forms in the browser can use it.

export type LogoType = 'image/png' | 'image/jpeg' | 'image/webp';

/** The names of the logo types an admin can upload, for texts. */
export const LOGO_TYPE_NAMES: Record<LogoType, string> = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP' };

export const MAX_LOGO_BYTES = 1024 * 1024;
/** The longest side of an uploaded logo, in pixels. */
export const MAX_LOGO_SIDE = 2000;
export const GAME_LOGO_HEIGHT = 32;
export const GAME_LOGO_MAX_WIDTH = 160;

const LOGO_TYPES = Object.values(LOGO_TYPE_NAMES);
/** The logo types for texts, such as `PNG, JPEG or WebP`. */
export const LOGO_TYPE_LIST = `${LOGO_TYPES.slice(0, -1).join(', ')} or ${LOGO_TYPES.at(-1)}`;
export const MAX_LOGO_MB = MAX_LOGO_BYTES / (1024 * 1024);
/** The accept value of a logo file field. */
export const LOGO_ACCEPT = Object.keys(LOGO_TYPE_NAMES).join(',');
export const LOGO_HINT = `${LOGO_TYPE_LIST}. At most ${MAX_LOGO_MB} MB and ${MAX_LOGO_SIDE} pixels a side.`;
