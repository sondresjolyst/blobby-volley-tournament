import type { NextConfig } from 'next';

// The Content-Security-Policy is set in src/proxy.ts, since it holds a new nonce for each request.
const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
    output: 'standalone',
    poweredByHeader: false,
    // sharp loads libvips at run time, so the file trace misses it. Only the packages for the
    // platform of the build are installed, so this copies just those.
    outputFileTracingIncludes: { '/**/*': ['./node_modules/@img/**/*'] },
    async headers() {
        // The big screen address can hold its key, so it never goes out as a referrer or into a cache.
        const bigScreen = [
            { key: 'Referrer-Policy', value: 'no-referrer' },
            { key: 'Cache-Control', value: 'no-store' },
        ];
        return [
            { source: '/:path*', headers: securityHeaders },
            { source: '/big', headers: bigScreen },
            { source: '/api/big', headers: bigScreen },
        ];
    },
};

export default nextConfig;
