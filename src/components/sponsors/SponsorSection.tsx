import { InfoButton } from '@/components/InfoButton';
import { GAME_BOARDS, MAX_LINK_LENGTH, MAX_NAME_LENGTH, type GameBoard } from '@/lib/sponsors/input';
import { GAME_LOGO_HEIGHT, GAME_LOGO_MAX_WIDTH, LOGO_TYPE_LIST, MAX_LOGO_MB, MAX_LOGO_SIDE } from '@/lib/sponsors/limits';
import Link from 'next/link';
import { MAX_LIBRARY_SPONSORS, MAX_SPONSORS, type LibrarySponsor, type SponsorRow } from '@/lib/store/sponsors';
import { AddSponsor, SponsorCards } from './SponsorCards';

const SPONSOR_ERRORS: Record<string, string> = {
    'sponsor-name': `The sponsor name must be 1 to ${MAX_NAME_LENGTH} characters.`,
    'sponsor-link': `The link must be an http or https address of at most ${MAX_LINK_LENGTH} characters, or empty.`,
    'sponsor-background': 'The background colour must be a colour such as #ffffff.',
    'sponsor-limit': `An event can have at most ${MAX_SPONSORS} sponsors.`,
    'logo-missing': 'Select a logo file.',
    'logo-size': `The logo file must be at most ${MAX_LOGO_MB} MB.`,
    'logo-type': `The logo must be a ${LOGO_TYPE_LIST} file. SVG is not allowed.`,
    'logo-image': `The logo file could not be read. Save it again as ${LOGO_TYPE_LIST} and try again.`,
    'logo-dimensions': `The logo can be at most ${MAX_LOGO_SIDE} pixels wide and high.`,
    'sponsor-taken': 'This event already has that sponsor.',
    'library-pick': 'Select a sponsor from the library.',
    'library-limit': `The sponsor library is full at ${MAX_LIBRARY_SPONSORS} sponsors. Go to Sponsor library and delete a sponsor that no event uses, or add one that is already in the library.`,
    'library-in-use': 'An event still uses this sponsor. Remove it from those events first.',
};

export function sponsorErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(SPONSOR_ERRORS, code) ? SPONSOR_ERRORS[code] : null;
}

const BOARD_LABELS: Record<GameBoard, string> = {
    off: 'Off',
    led: 'Dark LED with metal frame',
    printed: 'White printed panels',
    wood: 'Wooden beach bar',
    slim: 'Slim glossy LED',
    padded: 'Padded rounded board',
};

/**
 * The sponsors of an event on /admin/events/[id]: the board style of the game, the sponsors as
 * cards, and the Add sponsor form. `error` and `status` tell how the last sponsor form went. They
 * show here because the page opens at this section.
 */
export function SponsorSection({
    eventId,
    gameBoard,
    sponsors,
    library,
    error,
    status,
}: {
    eventId: number;
    gameBoard: GameBoard;
    sponsors: SponsorRow[];
    /** Every sponsor in the library, with the events that use it. */
    library: LibrarySponsor[];
    error: string | null;
    status: string | null;
}) {
    const here = new Set(sponsors.map((sponsor) => sponsor.libraryId));
    const available = library.filter((sponsor) => !here.has(sponsor.id));
    const shared = library.filter((sponsor) => here.has(sponsor.id) && sponsor.events.some((event) => event.id !== eventId)).map((sponsor) => sponsor.id);
    return (
        <section aria-labelledby="sponsors">
            <h2 id="sponsors">Sponsors</h2>
            <div className="admin-field-label">
                <p>The footer, the big screen and the game show the sponsors marked Shown, in this order.</p>
                <InfoButton label="About sponsor logos">
                    <p>
                        The game gets a copy of each logo {GAME_LOGO_HEIGHT} pixels high and at most {GAME_LOGO_MAX_WIDTH} pixels wide. Select Up or Down to change the order.
                    </p>
                    <p>Hidden sponsors stay here, but the footer, the big screen and the game leave them out.</p>
                </InfoButton>
            </div>
            <form method="post" action={`/api/admin/events/${eventId}/game-board`} className="admin-panel">
                <div className="admin-field">
                    <div className="admin-field-label">
                        <label htmlFor="gameBoard">Sponsor board in the game</label>
                        <InfoButton label="About the sponsor board" textId="gameBoard-help">
                            <p>The style of the board behind the sponsor logos in the game.</p>
                            <p>When the board is off, the game shows no sponsors. The footer of the site is not affected.</p>
                        </InfoButton>
                    </div>
                    <select id="gameBoard" name="gameBoard" aria-describedby="gameBoard-help" defaultValue={gameBoard}>
                        {GAME_BOARDS.map((board) => (
                            <option key={board} value={board}>
                                {BOARD_LABELS[board]}
                            </option>
                        ))}
                    </select>
                </div>
                <button type="submit">Save board</button>
            </form>
            {error && <p role="alert">{error}</p>}
            {status && <p role="status">{status}</p>}
            {sponsors.length === 0 ? <p>No sponsors yet.</p> : <SponsorCards sponsors={sponsors} shared={shared} />}
            {available.length > 0 && (
                <form method="post" action={`/api/admin/events/${eventId}/sponsors/library`} className="admin-panel">
                    <p>
                        <label>
                            Add from the library{' '}
                            <select name="libraryId" required defaultValue="">
                                <option value="" disabled>
                                    Select a sponsor
                                </option>
                                {available.map((sponsor) => (
                                    <option key={sponsor.id} value={sponsor.id}>
                                        {sponsor.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </p>
                    <button type="submit">Add to event</button>
                </form>
            )}
            <AddSponsor action={`/api/admin/events/${eventId}/sponsors`} />
            <p className="admin-hint">
                A new sponsor goes into the <Link href="/admin/sponsors">sponsor library</Link> too, so other events can use it.
            </p>
        </section>
    );
}
