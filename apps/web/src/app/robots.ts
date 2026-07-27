import type { MetadataRoute } from 'next';

/**
 * Robots policy. DropTo is a private, login-gated app, so search engines are told
 * to stay out entirely (nothing here should be indexed).
 * @returns The robots definition
 */
export default function Robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
