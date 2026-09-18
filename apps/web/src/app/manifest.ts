import type { MetadataRoute } from 'next';

import { metadataConfig } from '@/configs/seo/metadata.config';

/** The name and the accent color come from the runtime env, so this must not be prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Web app manifest (PWA); the icons are rendered on the fly in the instance's accent color.
 **/
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
      { src: '/api/icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/api/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
