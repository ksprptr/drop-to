import type { MetadataRoute } from 'next';

import { metadataConfig } from '@/configs/seo/metadata.config';

/**
 * Web app manifest (PWA). Icons are uploaded to `public/`.
 * @returns The manifest definition
 */
export default function Manifest(): MetadataRoute.Manifest {
  return {
    name: metadataConfig.title,
    short_name: metadataConfig.shortTitle,
    description: metadataConfig.description,
    start_url: '/',
    display: 'standalone',
    background_color: metadataConfig.colors.background,
    theme_color: metadataConfig.colors.theme,
    icons: [
      {
        src: '/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
