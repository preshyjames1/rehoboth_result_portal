/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // M-04 FIX: production domain added alongside localhost
      allowedOrigins: ['localhost:3000', 'result.schuwap.xyz'],
    },
  },

  poweredByHeader: false,

  async headers() {
    return [
      // ── Apply to every route ─────────────────────────────────────
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options',            value: 'DENY' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          // L-01 FIX: HSTS — force HTTPS for 2 years, include subdomains, submit to preload list
          {
            key:   'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // L-01 FIX: Content Security Policy
          // 'unsafe-inline' is required for Tailwind's inline styles and Next.js hydration.
          // Tighten with nonces in a future iteration once usage is stable.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "frame-src 'self'",                        // PDF proxy routes are same-origin
              "connect-src 'self' https://*.supabase.co https://api.paystack.co https://checkout.paystack.com",
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://checkout.paystack.com",
            ].join('; '),
          },
        ],
      },

      // ── Result page — extra strict ────────────────────────────────
      {
        source: '/result(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },

      // ── All API routes — no caching ───────────────────────────────
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
