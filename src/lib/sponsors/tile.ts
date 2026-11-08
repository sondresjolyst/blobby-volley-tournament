// The look of a sponsor tile on the site, the big screen and the admin pages.

/** The tile colour of a sponsor without its own background colour: the dark brown of the design, so a white logo stays readable. */
export const DEFAULT_TILE_BACKGROUND = '#3a2820';

/** The colour behind a logo: the background colour of the sponsor, or the dark default. */
export const tileBackground = (background: string | null) => background ?? DEFAULT_TILE_BACKGROUND;
