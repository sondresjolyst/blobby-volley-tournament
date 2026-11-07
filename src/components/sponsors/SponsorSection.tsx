import { GAME_BOARDS, MAX_LINK_LENGTH, MAX_NAME_LENGTH, type GameBoard } from '@/lib/sponsors/input';
import { GAME_LOGO_HEIGHT, GAME_LOGO_MAX_WIDTH, MAX_LOGO_SIDE } from '@/lib/sponsors/logo';
import { MAX_SPONSORS, type SponsorRow } from '@/lib/store/sponsors';

const SPONSOR_ERRORS: Record<string, string> = {
    'sponsor-name': `The sponsor name must be 1 to ${MAX_NAME_LENGTH} characters.`,
    'sponsor-link': `The link must be an http or https address of at most ${MAX_LINK_LENGTH} characters, or empty.`,
    'sponsor-background': 'The game background must be a colour such as #ffffff.',
    'sponsor-limit': `An event can have at most ${MAX_SPONSORS} sponsors.`,
    'logo-missing': 'Pick a logo file.',
    'logo-size': 'The logo file must be at most 1 MB.',
    'logo-type': 'The logo must be a PNG, JPEG or WebP file. SVG is not allowed.',
    'logo-image': 'The logo file could not be read. Save it again as PNG, JPEG or WebP and try again.',
    'logo-dimensions': `The logo can be at most ${MAX_LOGO_SIDE} pixels wide and high.`,
};

export function sponsorErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(SPONSOR_ERRORS, code) ? SPONSOR_ERRORS[code] : null;
}

const ACCEPT = 'image/png,image/jpeg,image/webp';

const BOARD_LABELS: Record<GameBoard, string> = {
    off: 'Off',
    led: 'Dark LED with metal frame',
    printed: 'White printed panels',
    wood: 'Wooden beach bar',
    slim: 'Slim glossy LED',
    padded: 'Padded rounded board',
};

/** The name, link, game background and on or off fields, shared by the add and edit forms. */
function SponsorFields({ sponsor, subject }: { sponsor?: SponsorRow; subject: string }) {
    return (
        <>
            <label>
                Name of {subject} <input name="name" required maxLength={MAX_NAME_LENGTH} defaultValue={sponsor?.name} autoComplete="off" />
            </label>{' '}
            <label>
                Link of {subject} <input name="link" type="url" maxLength={MAX_LINK_LENGTH} defaultValue={sponsor?.link ?? ''} placeholder="https://" autoComplete="off" />
            </label>{' '}
            <label>
                <input name="ownBackground" type="checkbox" defaultChecked={sponsor ? sponsor.gameBackground !== null : false} /> Own game background for {subject}
            </label>{' '}
            <label>
                Game background of {subject} <input name="gameBackground" type="color" defaultValue={sponsor?.gameBackground ?? '#ffffff'} />
            </label>{' '}
            <label>
                <input name="enabled" type="checkbox" defaultChecked={sponsor?.enabled ?? true} /> Show {subject}
            </label>
        </>
    );
}

/** The sponsor list of an event on /admin/events/[id], with forms to add, edit, move and delete. */
export function SponsorSection({ eventId, gameBoard, sponsors }: { eventId: number; gameBoard: GameBoard; sponsors: SponsorRow[] }) {
    return (
        <section aria-labelledby="sponsors">
            <h2 id="sponsors">Sponsors</h2>
            <p>
                The footer and the game show the sponsors that are on, in this order. A logo is a PNG, JPEG or WebP file of at most 1 MB and {MAX_LOGO_SIDE} pixels a side. The game gets a
                copy {GAME_LOGO_HEIGHT} pixels high and at most {GAME_LOGO_MAX_WIDTH} wide. Transparent parts stay transparent, so the board shows through, unless the sponsor has its own game background.
            </p>
            <form method="post" action={`/api/admin/events/${eventId}/game-board`}>
                <label>
                    Sponsor board in the game{' '}
                    <select name="gameBoard" defaultValue={gameBoard}>
                        {GAME_BOARDS.map((board) => (
                            <option key={board} value={board}>
                                {BOARD_LABELS[board]}
                            </option>
                        ))}
                    </select>
                </label>{' '}
                <button type="submit">Change board</button>
            </form>
            <p>When the board is off, the game shows no sponsors. The footer is not affected.</p>
            {sponsors.length === 0 ? (
                <p>No sponsors yet.</p>
            ) : (
                <div className="admin-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Logo</th>
                                <th>Sponsor</th>
                                <th>Order</th>
                                <th>Delete</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sponsors.map((sponsor, index) => (
                                <tr key={sponsor.id}>
                                    <td data-label="Logo">
                                        {/* The logo is served as it was stored. The image optimizer of Next is not used. */}
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`/api/admin/sponsors/${sponsor.id}/logo?v=${sponsor.logoHash}`} alt={`Logo of ${sponsor.name}`} height={40} width={Math.round((40 * sponsor.logoWidth) / sponsor.logoHeight)} />
                                        {!sponsor.enabled && <p>Off</p>}
                                    </td>
                                    <td>
                                        <form method="post" action={`/api/admin/sponsors/${sponsor.id}`} encType="multipart/form-data">
                                            <SponsorFields sponsor={sponsor} subject={sponsor.name} />{' '}
                                            <label>
                                                New logo of {sponsor.name} <input name="logo" type="file" accept={ACCEPT} />
                                            </label>{' '}
                                            <button type="submit" aria-label={`Save ${sponsor.name}`}>
                                                Save
                                            </button>
                                        </form>
                                    </td>
                                    <td>
                                        <form method="post" action={`/api/admin/sponsors/${sponsor.id}/move`}>
                                            <button type="submit" name="direction" value="up" disabled={index === 0} aria-label={`Move ${sponsor.name} up`}>
                                                Up
                                            </button>{' '}
                                            <button type="submit" name="direction" value="down" disabled={index === sponsors.length - 1} aria-label={`Move ${sponsor.name} down`}>
                                                Down
                                            </button>
                                        </form>
                                    </td>
                                    <td>
                                        <form method="post" action={`/api/admin/sponsors/${sponsor.id}/delete`}>
                                            <button type="submit" aria-label={`Delete ${sponsor.name}`}>
                                                Delete
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <h3>Add a sponsor</h3>
            <form method="post" action={`/api/admin/events/${eventId}/sponsors`} encType="multipart/form-data">
                <SponsorFields subject="the new sponsor" />{' '}
                <label>
                    Logo of the new sponsor <input name="logo" type="file" required accept={ACCEPT} />
                </label>{' '}
                <button type="submit">Add sponsor</button>
            </form>
        </section>
    );
}
