import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'wasm-unsafe-eval' lets /playground compile the PostgreSQL parser WASM.
      // It permits WebAssembly compilation only, not eval() or new Function().
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.stripe.com",
      // The homepage and /playground run the analysis engine in a same-origin
      // Web Worker. Without this, worker-src falls back to script-src, which
      // works today but is left to chance.
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://img.shields.io",
      "font-src 'self'",
      "connect-src 'self' https://api.stripe.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['libpg-query'],
  async redirects() {
    return [
      // /enterprise promised SOC 2, HIPAA, an uptime SLA and a Slack channel,
      // none of which exist. Pricing now answers the same questions honestly.
      { source: '/enterprise', destination: '/pricing', permanent: true },
      // /docs/rules was a second, thinner listing of the same 112 rules: a table
      // of ids and severities, linking to the same pages /rules links to. Two
      // indexes of one catalogue split the inbound links and left one of them
      // to rot. /rules is the one that carries the facets.
      { source: '/docs/rules', destination: '/rules', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
