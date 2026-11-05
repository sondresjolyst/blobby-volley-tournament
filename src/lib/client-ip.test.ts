import { describe, expect, it } from 'vitest';
import { clientBucket, SHARED_CLIENT_BUCKET } from './client-ip';

const headers = (values: Record<string, string>) => new Headers(values);

describe('clientBucket', () => {
    it('reads the address from the header the trusted proxy sets', () => {
        expect(clientBucket(headers({ 'x-real-ip': '192.0.2.7' }), { TRUSTED_PROXY_IP_HEADER: 'X-Real-IP' })).toBe('ip:192.0.2.7');
        expect(clientBucket(headers({ 'x-real-ip': '2001:DB8::1' }), { TRUSTED_PROXY_IP_HEADER: 'x-real-ip' })).toBe('ip:2001:db8::1');
    });

    it('uses the last entry of a list, which the trusted proxy added', () => {
        expect(clientBucket(headers({ 'x-forwarded-for': '203.0.113.9, 192.0.2.7' }), { TRUSTED_PROXY_IP_HEADER: 'x-forwarded-for' })).toBe('ip:192.0.2.7');
    });

    it('ignores client headers when no trusted header is configured', () => {
        expect(clientBucket(headers({ 'x-forwarded-for': '192.0.2.7', 'x-real-ip': '192.0.2.8' }), {})).toBe(SHARED_CLIENT_BUCKET);
        expect(clientBucket(headers({ 'x-forwarded-for': '192.0.2.7' }), { TRUSTED_PROXY_IP_HEADER: '' })).toBe(SHARED_CLIENT_BUCKET);
    });

    it('falls back to the shared bucket when the header is missing or is not an address', () => {
        const env = { TRUSTED_PROXY_IP_HEADER: 'x-real-ip' };
        expect(clientBucket(headers({}), env)).toBe(SHARED_CLIENT_BUCKET)
        expect(clientBucket(headers({ 'x-real-ip': 'evil:bucket name' }), env)).toBe(SHARED_CLIENT_BUCKET);
        expect(clientBucket(headers({ 'x-real-ip': '1'.repeat(46) }), env)).toBe(SHARED_CLIENT_BUCKET);
    });

    it('ignores a header name that is not valid', () => {
        expect(clientBucket(headers({ 'x-real-ip': '192.0.2.7' }), { TRUSTED_PROXY_IP_HEADER: 'x real ip' })).toBe(SHARED_CLIENT_BUCKET);
    });
});
