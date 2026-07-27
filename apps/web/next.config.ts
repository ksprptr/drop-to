import type { NextConfig } from 'next';
import path from 'node:path';

const monorepoRoot = path.join(__dirname, '../..');
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Google origins the app talks to in the browser: the Picker/OAuth scripts and
 * frames (`apis.google.com`, `*.google.com`), its XHRs (`*.googleapis.com`) and
 * the images it renders (`*.googleusercontent.com`, `*.gstatic.com`). Kept broad
 * so the Google Picker and any Drive thumbnails work in production.
 */
const GOOGLE_SCRIPT = 'https://apis.google.com https://*.gstatic.com';
const GOOGLE_FRAME =
  'https://*.google.com https://*.googleusercontent.com https://content.googleapis.com';
const GOOGLE_CONNECT = 'https://apis.google.com https://*.googleapis.com';
const GOOGLE_IMG = 'https://*.googleusercontent.com https://*.gstatic.com https://*.google.com';

/**
 * Content-Security-Policy for the app.
 *
 * Deliberately permissive to avoid breaking Next.js (inline bootstrap/hydration
 * scripts, inline styles) and next/font; `'unsafe-eval'` is only allowed in
 * development, where the Next dev/HMR runtime needs it. The hard guarantees kept
 * everywhere: framing is blocked (`frame-ancestors 'none'`), plugins are disabled
 * (`object-src 'none'`), and `<base>` is same-origin. Images, the Picker and
 * OAuth are additionally allowed from Google's origins.
 */
const contentSecurityPolicy = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} ${GOOGLE_SCRIPT}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: ${GOOGLE_IMG}`,
  `font-src 'self' data:`,
  `connect-src 'self'${isDevelopment ? ' ws: http://localhost:*' : ''} ${GOOGLE_CONNECT}`,
  `frame-src 'self' ${GOOGLE_FRAME}`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
]
  .join('; ')
  .concat(';');

/** Security headers applied to every response. */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Only honored over HTTPS; safe to always send.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ['@dropto/types'],
  turbopack: {
    root: monorepoRoot,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    dangerouslyAllowLocalIP: isDevelopment,
    remotePatterns: [
      { protocol: 'https', hostname: '**.googleusercontent.com', pathname: '**' },
      { protocol: 'https', hostname: '**.gstatic.com', pathname: '**' },
    ],
  },
};

if (isDevelopment) {
  nextConfig.images?.remotePatterns?.push({
    protocol: 'http',
    hostname: 'localhost',
    pathname: '**',
  });
}

export default nextConfig;
