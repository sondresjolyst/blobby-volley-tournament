// The words of the Resultat page. They are written in the jokey Rogaland dialect of the LAN.
import { TRAINING_TAG } from '@/components/training/text';
import type { GameListRow } from '@/lib/store/game-list';
import { UNKNOWN_PLAYER } from './match-text';

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
    see: 'Sjå kampen',
    list: 'Kampa',
} as const;

const KIND_TAGS: Record<GameListRow['kind'], string> = { tournament: 'Turnering', '1v1': '1v1', training: TRAINING_TAG };

export const kindTag = (kind: GameListRow['kind']) => KIND_TAGS[kind];

/** Such as `Ola mot Kari`. */
export const gameNames = (row: Pick<GameListRow, 'names'>) => `${row.names[0] ?? UNKNOWN_PLAYER} mot ${row.names[1] ?? UNKNOWN_PLAYER}`;

/** Such as `2–1`, or `i gang` while the game runs. */
export const gameScore = (row: Pick<GameListRow, 'score' | 'running'>) => (row.score ? `${row.score[0]}–${row.score[1]}` : RESULT_TEXT.running);

/** The link of the Resultat page for a player and an opponent. */
export const resultHref = (playerId: number, opponentId?: number) => `/resultat?spelar=${playerId}${opponentId === undefined ? '' : `&mot=${opponentId}`}`;
