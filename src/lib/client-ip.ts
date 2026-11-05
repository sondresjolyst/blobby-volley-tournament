/** The bucket for clients whose address is unknown. They share one limit. */
export const SHARED_CLIENT_BUCKET = 'ip:unknown';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEX_GROUP = /^[0-9a-f]{1,4}$/;
const HEADER_NAME = /^[A-Za-z0-9-]+$/;

/** The 8 groups of an IPv6 address, or null when it is not one. */
function ipv6Groups(address: string): string[] | null {
    if (address.length > 45) return null;
    let text = address.toLowerCase();
    // An IPv4 address at the end, as in ::ffff:192.0.2.7, takes the place of the last two groups.
    const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) {
        if (!IPV4.test(dotted[2])) return null;
        const [a, b, c, d] = dotted[2].split('.').map(Number);
        text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    }
    const halves = text.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
    const groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
    if (!groups.every((group) => HEX_GROUP.test(group))) return null;
    return groups.map((group) => parseInt(group, 16).toString(16));
}

/**
 * The limit bucket for the client. The address is read only from the header named in
 * TRUSTED_PROXY_IP_HEADER, which the proxy in front of the site must set. Other headers can be
 * forged by the client, so they are ignored. When the header holds a list, such as
 * X-Forwarded-For, the last entry is used, because the trusted proxy adds it. An IPv6 address
 * is cut to its /64 prefix, because one home or LAN usually gets a whole /64.
 */
export function clientBucket(headers: Headers, env: Record<string, string | undefined>): string {
    const name = env.TRUSTED_PROXY_IP_HEADER?.trim();
    if (!name || !HEADER_NAME.test(name)) return SHARED_CLIENT_BUCKET;
    const value = headers.get(name);
    if (!value) return SHARED_CLIENT_BUCKET;
    const last = value.split(',').at(-1)!.trim();
    if (IPV4.test(last)) return `ip:${last}`;
    const groups = ipv6Groups(last);
    if (!groups) return SHARED_CLIENT_BUCKET;
    // An IPv4 address written as IPv6 is counted as that IPv4 address.
    if (groups.slice(0, 5).every((group) => group === '0') && groups[5] === 'ffff') {
        const [high, low] = [parseInt(groups[6], 16), parseInt(groups[7], 16)];
        return `ip:${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    return `ip:${groups.slice(0, 4).join(':')}::/64`;
}

/**
 * The warning to log at startup in production when no trusted address header is set. Without it
 * every client shares one limit for unknown nicknames and wrong event codes.
 */
export function proxyHeaderWarning(env: Record<string, string | undefined>): string | null {
    if (env.NODE_ENV !== 'production' || env.TRUSTED_PROXY_IP_HEADER?.trim()) return null;
    return 'TRUSTED_PROXY_IP_HEADER is not set, so every client shares one sign-in limit. Set it to the header in which your proxy puts the client address, and only when the proxy overwrites that header.';
}
