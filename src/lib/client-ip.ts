/** The bucket for clients whose address is unknown. They share one limit. */
export const SHARED_CLIENT_BUCKET = 'ip:unknown';

const ADDRESS = /^[0-9A-Fa-f:.]{2,45}$/;
const HEADER_NAME = /^[A-Za-z0-9-]+$/;

/**
 * The limit bucket for the client. The address is read only from the header named in
 * TRUSTED_PROXY_IP_HEADER, which the proxy in front of the site must set. Other headers can be
 * forged by the client, so they are ignored. When the header holds a list, such as
 * X-Forwarded-For, the last entry is used, because the trusted proxy adds it.
 */
export function clientBucket(headers: Headers, env: Record<string, string | undefined>): string {
    const name = env.TRUSTED_PROXY_IP_HEADER?.trim();
    if (!name || !HEADER_NAME.test(name)) return SHARED_CLIENT_BUCKET;
    const value = headers.get(name);
    if (!value) return SHARED_CLIENT_BUCKET;
    const last = value.split(',').at(-1)!.trim();
    return ADDRESS.test(last) ? `ip:${last.toLowerCase()}` : SHARED_CLIENT_BUCKET;
}
