// The look of a sponsor tile on the site, the big screen and the admin pages.

/** The stroke of every sponsor tile, so logos need no stroke of their own. */
export const TILE_STROKE = '#5a4033';
export const TILE_RADIUS = 12;
/** The tile colour of a sponsor without its own background colour. */
export const DEFAULT_TILE_BACKGROUND = '#fff8ec';

/** The colour behind a logo: the background colour of the sponsor, or the cream default. */
export const tileBackground = (background: string | null) => background ?? DEFAULT_TILE_BACKGROUND;
