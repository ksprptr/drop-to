import type { MetadataRoute } from 'next';

/**
 * Robots — DropTo is private/login-gated, so disallow indexing entirely.
 **/
export default function Robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
