// The words of the stats block on the player profile. They are written in the jokey Rogaland dialect of the LAN.
import type { StatsScope } from '@/lib/store/game-stats';

export const SCOPE_LABELS: Record<StatsScope, string> = { matches: 'Kampa', training: 'Trening', all: 'Alt' };

export const PROFILE_TEXT = {
    stats: 'Statistikk frå spela',
    recent: 'Siste kampa',
    touchesPerGame: 'Touch per sett',
    errorsPerGame: 'Feil per sett',
    games: 'Sett med statistikk',
    noStats: {
        matches: 'Ingen sett med statistikk ennå.',
        training: 'Ingen treninga med statistikk ennå.',
        all: 'Ingen sett med statistikk ennå.',
    },
} as const;

/** The most games the profile lists. */
export const RECENT_GAMES = 10;
