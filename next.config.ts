import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

// Next puts inline scripts in every page for its own bootstrap. A nonce would remove the need for
// 'unsafe-inline' in script-src. It is not set up yet.
const contentSecurityPolicy = [
    "default-src 'self'",
    dev ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "font-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
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
