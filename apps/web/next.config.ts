import type { NextConfig } from 'next';
import path from 'node:path';

const monorepoRoot = path.join(__dirname, '../..');
const isDevelopment = process.env.NODE_ENV === 'development';

// Google origins (Picker/OAuth scripts, frames, XHRs, images) allowed by the CSP.
const GOOGLE_SCRIPT = 'https://apis.google.com https://*.gstatic.com';
const GOOGLE_FRAME =
  'https://*.google.com https://*.googleusercontent.com https://content.googleapis.com';
const GOOGLE_CONNECT = 'https://apis.google.com https://*.googleapis.com';
const GOOGLE_IMG = 'https://*.googleusercontent.com https://*.gstatic.com https://*.google.com';

// CSP: Next injects inline bootstrap scripts and React inline styles, so `script-src`/`style-src`
// keep 'unsafe-inline' (a nonce-based policy would need per-request middleware wiring and risks
// breaking framer-motion/Next inline styles). `object-src 'none'`, `frame-ancestors 'none'` and
// `base-uri 'self'` still block the main injection sinks; Google is allowed for Picker/OAuth/images.
// FUTURE: (hardening) drop 'unsafe-inline' from `script-src` in favour of a per-request nonce
// (generate it in proxy.ts and thread it through). Low priority while there are zero XSS sinks
// (no dangerouslySetInnerHTML / untrusted-HTML render); it matters if such a sink is ever added.
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

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Drop ambient access to sensor/geolocation APIs the app never uses.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
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
