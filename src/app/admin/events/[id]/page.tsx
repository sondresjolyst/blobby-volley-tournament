import { AdminShell } from '@/components/admin/AdminShell';
import { adminTime } from '@/components/admin/time';
import { notFound } from 'next/navigation';
import { BigScreenSection, bigScreenErrorMessage } from '@/components/events/BigScreenSection';
import { EventForm, eventErrorMessage } from '@/components/events/EventForm';
import { SponsorSection, sponsorErrorMessage } from '@/components/sponsors/SponsorSection';
import { adjustErrorMessage } from '@/lib/betting/input';
import { requireAdmin } from '@/lib/auth/options';
import { bigScreenUrl } from '@/lib/big-screen/key';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getBigScreenKey, getEvent } from '@/lib/store/events';
import { countedWrongPins, isLocked, MAX_WRONG_PINS } from '@/lib/players/lockout';
import { busiestPinClient, CLIENT_WRONG_PINS_PER_HOUR, listPlayers } from '@/lib/store/players';
import { listLibrary, listSponsors } from '@/lib/store/sponsors';

type Search = {
    error?: string | string[];
    saved?: string | string[];
    reset?: string | string[];
    adjusted?: string | string[];
    rotated?: string | string[];
    unlocked?: string | string[];
    pinLimit?: string | string[];
    sponsor?: string | string[];
    sponsorDeleted?: string | string[];
    boardSaved?: string | string[];
    bigScreenKey?: string | string[];
    rotationSaved?: string | string[];
};

export default async function EditEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
    await requireAdmin();
    const id = parseId((await params).id);
    if (id === null) notFound();
    const pool = getPool();
    const event = await getEvent(pool, id);
    if (!event) notFound();
    const now = new Date();
    const players = await listPlayers(pool, id);
    const pinPeak = await busiestPinClient(pool, now);
    const [sponsors, library] = await Promise.all([listSponsors(pool, id), listLibrary(pool)]);
    const bigScreenKey = await getBigScreenKey(pool, id);
    const search = await searchParams;
    const message = eventErrorMessage(search.error) ?? adjustErrorMessage(search.error) ?? bigScreenErrorMessage(search.error);
    // A failed sponsor form shows its message in the sponsor section, where the page opens.
    const sponsorError = sponsorErrorMessage(search.error);
    const resetId = typeof search.reset === 'string' ? parseId(search.reset) : null;
    const resetPlayer = players.find((player) => player.id === resetId);
    const adjustedId = typeof search.adjusted === 'string' ? parseId(search.adjusted) : null;
    const adjustedPlayer = players.find((player) => player.id === adjustedId);
    const rotatedId = typeof search.rotated === 'string' ? parseId(search.rotated) : null;
    const rotatedPlayer = players.find((player) => player.id === rotatedId);
    const unlockedId = typeof search.unlocked === 'string' ? parseId(search.unlocked) : null;
    const unlockedPlayer = players.find((player) => player.id === unlockedId);
    const savedSponsorId = typeof search.sponsor === 'string' ? parseId(search.sponsor) : null;
    const savedSponsor = sponsors.find((sponsor) => sponsor.id === savedSponsorId);
    const sponsorStatus = savedSponsor
        ? `Saved the sponsor ${savedSponsor.name}.`
        : search.sponsorDeleted === '1'
          ? 'The sponsor is removed from this event. It stays in the sponsor library.'
          : search.boardSaved === '1'
            ? 'Saved the sponsor board.'
            : null;
    return (
        <AdminShell section="events">
            <h1>{event.name}</h1>
            <p>{event.isActive ? 'This is the active event.' : 'This event is not active.'}</p>
            {!event.isActive && (
                <form method="post" action={`/api/admin/events/${event.id}/activate`}>
                    <button type="submit">Set active</button>
                </form>
            )}
            {message && <p role="alert">{message}</p>}
            {search.saved === '1' && <p role="status">Saved.</p>}
            {resetPlayer && <p role="status">The PIN for {resetPlayer.nickname} is reset.</p>}
            {rotatedPlayer && <p role="status">{rotatedPlayer.nickname} has a new join code. The old code stops working.</p>}
            {unlockedPlayer && <p role="status">{unlockedPlayer.nickname} is unlocked and can sign in again.</p>}
            {search.pinLimit === 'reset' && <p role="status">The network PIN limit is reset. Every network can try PINs again.</p>}
            {search.bigScreenKey === 'new' && <p role="status">The big screen has a new key. The old address stops showing the join card.</p>}
            {search.rotationSaved === '1' && <p role="status">Saved the big screen screens.</p>}
            {adjustedPlayer && (
                <p role="status">
                    The Foza of {adjustedPlayer.nickname} is now {adjustedPlayer.fozaBalance}.
                </p>
            )}

            <h2>Edit event</h2>
            <EventForm action={`/api/admin/events/${event.id}`} event={event} submitLabel="Save" />

            <h2>Players</h2>
            {players.length === 0 ? (
                <p>No players yet.</p>
            ) : (
                <div className="admin-table">
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
                            {players.map((player) => (
                                <tr key={player.id}>
                                    <td data-label="Nickname">{player.nickname}</td>
                                    <td data-label="Foza">{player.fozaBalance}</td>
                                    <PinLockCell id={player.id} nickname={player.nickname} lockedUntil={player.lockedUntil} wrongPins={countedWrongPins(player.failedPinAttempts, player.lastFailedPinAt, now)} now={now} />
                                    <td>
                                        <form method="post" action={`/api/admin/players/${player.id}/pin`}>
                                            <input type="hidden" name="eventId" value={event.id} />
                                            <label>
                                                New PIN for {player.nickname}{' '}
                                                <input name="pin" type="password" required inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" />
                                            </label>{' '}
                                            <button type="submit">Reset PIN</button>
                                        </form>
                                    </td>
                                    <td>
                                        <form method="post" action={`/api/admin/players/${player.id}/foza`}>
                                            <input type="hidden" name="eventId" value={event.id} />
                                            <label>
                                                Foza change for {player.nickname}{' '}
                                                <input name="amount" type="text" required inputMode="numeric" pattern="[+\-]?[1-9][0-9]{0,6}" autoComplete="off" />
                                            </label>{' '}
                                            <label>
                                                Reason for {player.nickname} <input name="reason" type="text" required minLength={1} maxLength={200} autoComplete="off" />
                                            </label>{' '}
                                            <button type="submit">Adjust Foza</button>
                                        </form>
                                    </td>
                                    <td>
                                        <form method="post" action={`/api/admin/players/${player.id}/join-code`}>
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

            <h3>Network PIN limit</h3>
            <p>
                One network can give {CLIENT_WRONG_PINS_PER_HOUR} wrong PINs in an hour, across all players. After that nobody on it can sign in until the hour is over. Most players at the LAN
                share one network. The busiest network has {pinPeak} of {CLIENT_WRONG_PINS_PER_HOUR} wrong PINs this hour.
            </p>
            <form method="post" action="/api/admin/players/pin-limit">
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit">Reset network PIN limit</button>
            </form>

            {bigScreenKey && <BigScreenSection eventId={event.id} address={bigScreenUrl(bigScreenKey, process.env)} isActive={event.isActive} rotation={event.bigScreen} />}

            <SponsorSection eventId={event.id} gameBoard={event.gameBoard} sponsors={sponsors} library={library} error={sponsorError} status={sponsorStatus} />
        </AdminShell>
    );
}

/** The lock and the wrong PINs of a player, with the button that clears them. Empty while the player has neither. */
function PinLockCell({ id, nickname, lockedUntil, wrongPins, now }: { id: number; nickname: string; lockedUntil: Date | null; wrongPins: number; now: Date }) {
    const locked = isLocked(lockedUntil, now);
    if (!locked && wrongPins === 0) return <td data-label="PIN lock"></td>;
    return (
        <td data-label="PIN lock">
            {locked ? `Locked until ${adminTime(lockedUntil!)}` : `${wrongPins} of ${MAX_WRONG_PINS} wrong PINs`}{' '}
            <form method="post" action={`/api/admin/players/${id}/unlock`}>
                <button type="submit" aria-label={`Unlock ${nickname}`}>
                    Unlock
                </button>
            </form>
        </td>
    );
}
