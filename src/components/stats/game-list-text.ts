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
    pages: 'Sidene i lista',
    previous: 'Førre',
    next: 'Neste',
} as const;

/** Such as `Side 2` for the link of a page. */
export const pageLabel = (n: number) => `Side ${n}`;

/** Such as `11 te 20 av 34 spel`, or `5 spel` when all fit on one page. */
export function gameCount(list: { total: number; pages: number; first: number; last: number }): string {
    if (list.pages === 1) return `${list.total} spel`;
    return `${list.first} te ${list.last} av ${list.total} spel`;
}

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

/** The address of a page of the Resultat list with the same filter. Page 1 has no page number. */
export function resultPageHref(playerId: number | undefined, opponentId: number | undefined, page: number): string {
    const params = new URLSearchParams();
    if (playerId !== undefined) params.set('spelar', String(playerId));
    if (opponentId !== undefined) params.set('mot', String(opponentId));
    if (page > 1) params.set('side', String(page));
    const query = params.toString();
    return query === '' ? '/resultat' : `/resultat?${query}`;
}
