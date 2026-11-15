// The words of the Resultat page. They are written in the jokey Rogaland dialect of the LAN.
import { TRAINING_TAG } from '@/components/training/text';
import type { GameListRow } from '@/lib/store/game-list';
import { MATCH_TEXT, UNKNOWN_PLAYER } from './match-text';

export const RESULT_TEXT = {
    title: 'Resultat',
    subtitle: 'Alle kampa og treninga i LANet, med dei nyaste først.',
    player: 'Spelar',
    opponent: 'Motstandar',
    anyone: 'Alle',
    filter: 'Vis',
    reset: 'Nullstill',
    none: 'Ingen kampa e spelt ennå.',
    noneFiltered: 'Ingen kampa funne med dette utvalget.',
    running: 'i gang',
    live: 'LIVE',
    see: 'Sjå kampen',
    seeAll: 'Sjå kampane',
    list: 'Kampa',
} as const;

const KIND_TAGS: Record<GameListRow['kind'], string> = { tournament: 'Turnering', '1v1': '1v1', training: TRAINING_TAG };

export const kindTag = (kind: GameListRow['kind']) => KIND_TAGS[kind];

/** Such as `Ola vs Kari`. */
export const gameNames = (row: Pick<GameListRow, 'names'>) => `${row.names[0] ?? UNKNOWN_PLAYER} vs ${row.names[1] ?? UNKNOWN_PLAYER}`;

/** Such as `2–1`, `Walkover` for a no-show, or `i gang` for a training game that runs. */
export const gameScore = (row: Pick<GameListRow, 'score' | 'running' | 'walkover'>) => (row.walkover ? MATCH_TEXT.walkover : row.score ? `${row.score[0]}–${row.score[1]}` : RESULT_TEXT.running);

/** Names the pairing for a link that repeats on every row. */
export const seeGameLabel = (names: readonly [string | null, string | null]) => `${RESULT_TEXT.see}: ${names[0] ?? UNKNOWN_PLAYER} mot ${names[1] ?? UNKNOWN_PLAYER}`;

/** The link of the Resultat page for a player and an opponent. */
export const resultHref = (playerId: number, opponentId?: number) => `/resultat?spelar=${playerId}${opponentId === undefined ? '' : `&mot=${opponentId}`}`;
