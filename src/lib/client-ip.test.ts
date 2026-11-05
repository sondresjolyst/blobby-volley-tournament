import { describe, expect, it } from 'vitest';
import { clientBucket, proxyHeaderWarning, SHARED_CLIENT_BUCKET } from './client-ip';

const headers = (values: Record<string, string>) => new Headers(values);
const realIp = (value: string) => clientBucket(headers({ 'x-real-ip': value }), { TRUSTED_PROXY_IP_HEADER: 'x-real-ip' });

describe('clientBucket', () => {
    it('reads the address from the header the trusted proxy sets', () => {
        expect(clientBucket(headers({ 'x-real-ip': '192.0.2.7' }), { TRUSTED_PROXY_IP_HEADER: 'X-Real-IP' })).toBe('ip:192.0.2.7');
    });

    it('uses the last entry of a list, which the trusted proxy added', () => {
        expect(clientBucket(headers({ 'x-forwarded-for': '203.0.113.9, 192.0.2.7' }), { TRUSTED_PROXY_IP_HEADER: 'x-forwarded-for' })).toBe('ip:192.0.2.7');
    });

    it('cuts an IPv6 address to its /64 prefix', () => {
        expect(realIp('2001:DB8:1:2:aaaa:bbbb:cccc:dddd')).toBe('ip:2001:db8:1:2::/64');
        expect(realIp('2001:db8:1:2::1')).toBe('ip:2001:db8:1:2::/64');
        expect(realIp('2001:0db8:0001:0002:ffff::9')).toBe('ip:2001:db8:1:2::/64');
        expect(realIp('2001:db8::1')).toBe('ip:2001:db8:0:0::/64');
        expect(realIp('::1')).toBe('ip:0:0:0:0::/64');
    });

    it('gives two addresses in the same /64 one bucket, and other /64s their own', () => {
        expect(realIp('2001:db8:1:2::a')).toBe(realIp('2001:db8:1:2:ffff:ffff:ffff:ffff'));
        expect(realIp('2001:db8:1:2::a')).not.toBe(realIp('2001:db8:1:3::a'));
    });

    it('counts an IPv4 address written as IPv6 as that IPv4 address', () => {
        expect(realIp('::ffff:192.0.2.7')).toBe('ip:192.0.2.7');
        expect(realIp('::ffff:c000:207')).toBe('ip:192.0.2.7');
    });

    it('ignores client headers when no trusted header is configured', () => {
        expect(clientBucket(headers({ 'x-forwarded-for': '192.0.2.7', 'x-real-ip': '192.0.2.8' }), {})).toBe(SHARED_CLIENT_BUCKET);
        expect(clientBucket(headers({ 'x-forwarded-for': '192.0.2.7' }), { TRUSTED_PROXY_IP_HEADER: '' })).toBe(SHARED_CLIENT_BUCKET);
    });

    it.each(['', 'evil:bucket name', '1'.repeat(46), '300.1.1.1', '1.2.3', '2001:db8::1::2', '2001:db8:1:2:3:4:5:6:7', 'fe80::1%eth0', '12345::1'])(
        'falls back to the shared bucket for %j',
        (value) => {
            expect(realIp(value)).toBe(SHARED_CLIENT_BUCKET);
        },
    );

    it('ignores a header name that is not valid', () => {
        expect(clientBucket(headers({ 'x-real-ip': '192.0.2.7' }), { TRUSTED_PROXY_IP_HEADER: 'x real ip' })).toBe(SHARED_CLIENT_BUCKET);
    });
});

describe('proxyHeaderWarning', () => {
    it('warns in production when no trusted header is set', () => {
        expect(proxyHeaderWarning({ NODE_ENV: 'production' })).toMatch(/TRUSTED_PROXY_IP_HEADER is not set/);
        expect(proxyHeaderWarning({ NODE_ENV: 'production', TRUSTED_PROXY_IP_HEADER: ' ' })).toMatch(/TRUSTED_PROXY_IP_HEADER is not set/);
    });

    it('is quiet when the header is set, or outside production', () => {
        expect(proxyHeaderWarning({ NODE_ENV: 'production', TRUSTED_PROXY_IP_HEADER: 'x-real-ip' })).toBeNull();
        expect(proxyHeaderWarning({ NODE_ENV: 'development' })).toBeNull();
    });
});
