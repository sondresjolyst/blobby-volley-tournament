export interface EventInput {
    name: string;
    startsOn: string;
    endsOn: string;
    code: string;
    startingFoza: number;
    dailyFoza: number;
    /** The game server address for join links. Both are set or both are null. */
    serverHost?: string | null;
    serverPort?: number | null;
}

export const MAX_FOZA = 1_000_000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// At least 8 characters, so the code cannot be guessed in the attempts the limits allow.
const CODE = /^[A-Z0-9-]{8,32}$/;
const WHOLE = /^\d+$/;
// A host name or an IPv4 address. An IPv6 address would need brackets in a join link, so it is not allowed.
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const PORT = /^[1-9][0-9]{0,4}$/;

/** Event codes are compared in upper case, so a player can type them either way. */
export function normalizeEventCode(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function isDate(value: string): boolean {
    if (!DATE.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function amount(value: unknown): number | null {
    if (typeof value !== 'string' || !WHOLE.test(value.trim())) return null;
    const n = Number(value.trim());
    return n <= MAX_FOZA ? n : null;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export type EventInputResult = { ok: true; value: EventInput } | { ok: false; error: string };

/** Reads the event form. Dates are YYYY-MM-DD and the end is on or after the start. */
export function parseEventInput(form: Record<string, unknown>): EventInputResult {
    const name = text(form.name);
    if (name.length < 1 || name.length > 100) return { ok: false, error: 'name' };
    const startsOn = text(form.startsOn);
    const endsOn = text(form.endsOn);
    if (!isDate(startsOn) || !isDate(endsOn) || endsOn < startsOn) return { ok: false, error: 'dates' };
    const code = normalizeEventCode(form.code);
    if (!CODE.test(code)) return { ok: false, error: 'code' };
    const startingFoza = amount(form.startingFoza);
    const dailyFoza = amount(form.dailyFoza);
    if (startingFoza === null || dailyFoza === null) return { ok: false, error: 'foza' };
    const server = parseServer(text(form.serverHost).toLowerCase(), text(form.serverPort));
    if (!server) return { ok: false, error: 'server' };
    return { ok: true, value: { name, startsOn, endsOn, code, startingFoza, dailyFoza, ...server } };
}

/** Both empty means no game server yet. Otherwise both must be valid. */
function parseServer(host: string, port: string): { serverHost: string | null; serverPort: number | null } | null {
    if (host === '' && port === '') return { serverHost: null, serverPort: null };
    if (!HOST.test(host) || !PORT.test(port) || Number(port) > 65535) return null;
    return { serverHost: host, serverPort: Number(port) };
}
