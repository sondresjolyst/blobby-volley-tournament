import { isEventCode, normalizeEventCode } from '@/lib/events/code';
import { MAX_FOZA } from '@/lib/foza';
import { CONTAINER_PORT } from '@/lib/game-server/commands';

export { normalizeEventCode };

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WHOLE = /^\d+$/;
// A host name or an IPv4 address. An IPv6 address would need brackets in a join link, so it is not allowed.
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const PORT = /^[1-9][0-9]{0,4}$/;

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
    if (!isEventCode(code)) return { ok: false, error: 'code' };
    const startingFoza = amount(form.startingFoza);
    const dailyFoza = amount(form.dailyFoza);
    if (startingFoza === null || dailyFoza === null) return { ok: false, error: 'foza' };
    const host = text(form.serverHost).toLowerCase();
    if (isUnreachableHost(host)) return { ok: false, error: 'server-host' };
    const server = parseServer(host, text(form.serverPort));
    if (!server) return { ok: false, error: 'server' };
    return { ok: true, value: { name, startsOn, endsOn, code, startingFoza, dailyFoza, ...server } };
}

/**
 * True for a host the games of other players can never reach: this PC itself, or a web address
 * with a scheme such as http://.
 */
function isUnreachableHost(host: string): boolean {
    return host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '0.0.0.0' || /^[a-z][a-z0-9+.-]*:\/\//.test(host);
}

/** Both empty means no game server yet. An empty port with a host is the default port. */
function parseServer(host: string, rawPort: string): { serverHost: string | null; serverPort: number | null } | null {
    if (host === '' && rawPort === '') return { serverHost: null, serverPort: null };
    const port = rawPort === '' ? String(CONTAINER_PORT) : rawPort;
    if (!HOST.test(host) || !PORT.test(port) || Number(port) > 65535) return null;
    return { serverHost: host, serverPort: Number(port) };
}
