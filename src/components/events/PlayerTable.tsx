import Link from 'next/link';
import { ListFields, listHref, Pager, type ListState } from '@/components/admin/Pager';
import { adminTime } from '@/components/admin/time';
import { MAX_SEARCH, matchesSearch, pageOf } from '@/lib/paging';
import { countedWrongPins, isLocked, MAX_WRONG_PINS } from '@/lib/players/lockout';
import type { PlayerRow } from '@/lib/store/players';

/** The key of the players page in the address of the event page, such as `?players=2`. */
export const PLAYERS_PAGE = 'players';

/**
 * The players of an event on /admin/events/[id], 10 to a page, with a search by nickname. Each
 * form sends the page and the search along, so the admin comes back to the same page after an action.
 */
export function PlayerTable({ eventId, players, state, now }: { eventId: number; players: PlayerRow[]; state: ListState; now: Date }) {
    const path = `/admin/events/${eventId}`;
    const found = players.filter((player) => matchesSearch(state.q, player.nickname));
    const list = pageOf(found, state.pages[PLAYERS_PAGE] ?? 1);
    // The forms send the page that is shown, which is the last page when the address asks for one after it.
    const shown: ListState = { ...state, pages: { ...state.pages, [PLAYERS_PAGE]: list.page } };
    if (players.length === 0) return <p>No players yet.</p>;
    return (
        <>
            <form role="search" method="get" action={`${path}#players`} className="admin-search" aria-label="Players">
                <label>
                    Search by nickname <input type="search" name="q" defaultValue={state.q} maxLength={MAX_SEARCH} autoComplete="off" spellCheck={false} />
                </label>
                <button type="submit">Search</button>
                {state.q !== '' && <Link href={`${path}#players`}>Show all players</Link>}
            </form>
            {found.length === 0 ? (
                <p>No players have a nickname with {state.q}.</p>
            ) : (
                <div className="admin-table admin-players">
                    <table>
                        <thead>
                            <tr>
                                <th>Nickname</th>
                                <th>Foza</th>
                                <th>PIN lock</th>
                                <th>Reset PIN</th>
                                <th>Adjust Foza</th>
                                <th>Join code</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.items.map((player) => (
                                <tr key={player.id}>
                                    <td data-label="Nickname">{player.nickname}</td>
                                    <td data-label="Foza">{player.fozaBalance}</td>
                                    <PinLockCell
                                        id={player.id}
                                        nickname={player.nickname}
                                        lockedUntil={player.lockedUntil}
                                        wrongPins={countedWrongPins(player.failedPinAttempts, player.lastFailedPinAt, now)}
                                        now={now}
                                        state={shown}
                                    />
                                    <td>
                                        <form method="post" action={`/api/admin/players/${player.id}/pin`} className="admin-row-form">
                                            <input type="hidden" name="eventId" value={eventId} />
                                            <ListFields state={shown} />
                                            <label>
                                                <span className="admin-sr">New PIN for {player.nickname}</span>
                                                <input
                                                    name="pin"
                                                    type="password"
                                                    className="admin-input-pin"
                                                    placeholder="New PIN"
                                                    required
                                                    inputMode="numeric"
                                                    pattern="[0-9]{4}"
                                                    minLength={4}
                                                    maxLength={4}
                                                    autoComplete="off"
                                                />
                                            </label>
                                            <button type="submit">Reset PIN</button>
                                        </form>
                                    </td>
                                    <td>
                                        <form method="post" action={`/api/admin/players/${player.id}/foza`} className="admin-row-form">
                                            <input type="hidden" name="eventId" value={eventId} />
                                            <ListFields state={shown} />
                                            <label>
                                                <span className="admin-sr">Foza change for {player.nickname}, such as 50 or -50</span>
                                                <input
                                                    name="amount"
                                                    type="text"
                                                    className="admin-input-amount"
                                                    placeholder="50 or -50"
                                                    required
                                                    inputMode="numeric"
                                                    pattern="[+\-]?[1-9][0-9]{0,6}"
                                                    autoComplete="off"
                                                />
                                            </label>
                                            <label>
                                                <span className="admin-sr">Reason for {player.nickname}</span>
                                                <input name="reason" type="text" className="admin-input-reason" placeholder="Reason" required minLength={1} maxLength={200} autoComplete="off" />
                                            </label>
                                            <button type="submit">Adjust Foza</button>
                                        </form>
                                    </td>
                                    <td>
                                        <form method="post" action={`/api/admin/players/${player.id}/join-code`} className="admin-row-form">
                                            <ListFields state={shown} />
                                            <button type="submit" aria-label={`New join code for ${player.nickname}`}>
                                                New join code
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <Pager label="Pages of players" noun={['player', 'players']} list={list} href={(page) => listHref(path, shown, PLAYERS_PAGE, page, 'players')} />
        </>
    );
}

/** The lock and the wrong PINs of a player, with the button that clears them. Empty while the player has neither. */
function PinLockCell({ id, nickname, lockedUntil, wrongPins, now, state }: { id: number; nickname: string; lockedUntil: Date | null; wrongPins: number; now: Date; state: ListState }) {
    const locked = isLocked(lockedUntil, now);
    if (!locked && wrongPins === 0) return <td data-label="PIN lock"></td>;
    return (
        <td data-label="PIN lock">
            <div className="admin-lock">
                <span>{locked ? `Locked until ${adminTime(lockedUntil!)}` : `${wrongPins} of ${MAX_WRONG_PINS} wrong PINs`}</span>
                <form method="post" action={`/api/admin/players/${id}/unlock`} className="admin-row-form">
                    <ListFields state={state} />
                    <button type="submit" aria-label={`Unlock ${nickname}`}>
                        Unlock
                    </button>
                </form>
            </div>
        </td>
    );
}
