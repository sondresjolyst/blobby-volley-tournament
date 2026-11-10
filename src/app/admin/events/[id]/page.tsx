import { AdminShell } from '@/components/admin/AdminShell';
import { notFound } from 'next/navigation';
import { InfoButton } from '@/components/InfoButton';
import { BigScreenSection, bigScreenErrorMessage } from '@/components/events/BigScreenSection';
import { EventForm, eventErrorMessage } from '@/components/events/EventForm';
import { PLAYERS_PAGE, PlayerTable } from '@/components/events/PlayerTable';
import { SponsorSection, sponsorErrorMessage } from '@/components/sponsors/SponsorSection';
import { adjustErrorMessage } from '@/lib/betting/input';
import { requireAdmin } from '@/lib/auth/options';
import { bigScreenUrl } from '@/lib/big-screen/key';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { parsePage, parseSearch } from '@/lib/paging';
import { getBigScreenKey, getEvent } from '@/lib/store/events';
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
    players?: string | string[];
    q?: string | string[];
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
    const listState = { pages: { [PLAYERS_PAGE]: parsePage(search.players) }, q: parseSearch(search.q) };
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
          ? 'Removed the sponsor from this event. It is still in the sponsor library.'
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
            {search.saved === '1' && <p role="status">Saved the event.</p>}
            {resetPlayer && <p role="status">Reset the PIN for {resetPlayer.nickname}.</p>}
            {rotatedPlayer && <p role="status">{rotatedPlayer.nickname} has a new join code. The old join link stops working.</p>}
            {unlockedPlayer && <p role="status">{unlockedPlayer.nickname} is unlocked and can sign in again.</p>}
            {search.pinLimit === 'reset' && <p role="status">Reset the network PIN limit. Every network can try PINs again.</p>}
            {search.bigScreenKey === 'new' && <p role="status">Made a new big screen key. Open the new address on the TV, since the old one no longer shows the join card.</p>}
            {search.rotationSaved === '1' && <p role="status">Saved the screens.</p>}
            {adjustedPlayer && (
                <p role="status">
                    The Foza of {adjustedPlayer.nickname} is now {adjustedPlayer.fozaBalance}.
                </p>
            )}

            <h2>Edit event</h2>
            <EventForm action={`/api/admin/events/${event.id}`} event={event} submitLabel="Save" />

            <section id="players" aria-labelledby="players-heading">
                <h2 id="players-heading">Players</h2>
                <PlayerTable eventId={event.id} players={players} state={listState} now={now} />
            </section>

            <h3>Network PIN limit</h3>
            <div className="admin-field-label">
                <p>
                    The busiest network has {pinPeak} of {CLIENT_WRONG_PINS_PER_HOUR} wrong PINs this hour.
                </p>
                <InfoButton label="About the network PIN limit">
                    <p>
                        One network can give {CLIENT_WRONG_PINS_PER_HOUR} wrong PINs in an hour, across all players. After that nobody on it can sign in until the hour is over. Most
                        players at the event share one network.
                    </p>
                </InfoButton>
            </div>
            <form method="post" action="/api/admin/players/pin-limit">
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit">Reset network PIN limit</button>
            </form>

            {bigScreenKey && <BigScreenSection eventId={event.id} address={bigScreenUrl(bigScreenKey, process.env)} isActive={event.isActive} rotation={event.bigScreen} />}

            <SponsorSection eventId={event.id} gameBoard={event.gameBoard} sponsors={sponsors} library={library} error={sponsorError} status={sponsorStatus} />
        </AdminShell>
    );
}
